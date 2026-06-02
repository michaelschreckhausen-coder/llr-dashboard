// supabase/functions/stripe-subscription-webhook/index.ts
//
// Stripe Phase 3 — Webhook für Plan-Subscriptions + Credit-Top-Ups.
//
// Events:
//   checkout.session.completed
//     → flow='plan_subscription': UPDATE accounts SET plan_id (via plan_slug
//       in metadata), status='active', stripe_subscription_id, current_period_*
//     → flow='credit_topup' + type='credits': INSERT credit_topups
//       (one-shot, amount aus offer)
//     → flow='credit_topup' + type='storage_gb'|'crm_*': INSERT credit_topups
//       als recurring (is_recurring=true, no expires_at)
//
//   customer.subscription.updated
//     → Sync: status, current_period_end, cancel_at_period_end auf accounts
//
//   customer.subscription.deleted
//     → accounts.status='cancelled' + plan_id=free (oder NULL)
//
//   invoice.paid (subscription-rechnungen): updated_at refresh, kein direct-Action
//   invoice.payment_failed: accounts.status='past_due'
//
//   charge.refunded: credit_topups → status='refunded'
//
// Stripe-Signature-Verification: STRIPE_WEBHOOK_SECRET muss gesetzt sein.
//
// Idempotency: jeder Event-Handler ist sicher gegen Re-Delivery (Stripe
// retried bei non-2xx).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

function ok(msg = 'ok') {
  return new Response(JSON.stringify({ ok: true, msg }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
function bad(status: number, msg: string) {
  console.warn('[stripe-webhook] response', status, msg)
  return new Response(JSON.stringify({ error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method !== 'POST') return bad(405, 'method not allowed')

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  if (!stripeKey || !webhookSecret) return bad(500, 'stripe not configured')

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
  const sig = req.headers.get('stripe-signature') || ''
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret)
  } catch (e) {
    console.error('[stripe-webhook] signature verify failed:', (e as Error).message)
    return bad(400, 'signature verification failed')
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  console.log(`[stripe-webhook] received ${event.type} (${event.id})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const meta = session.metadata || {}
        const flow = meta.flow as string

        if (flow === 'plan_subscription') {
          await handlePlanSubscriptionCompleted(stripe, supabase, session, meta)
        } else if (flow === 'credit_topup') {
          await handleCreditTopupCompleted(stripe, supabase, session, meta)
        } else if (flow === 'marketplace_addon') {
          // Wird vom existing stripe-addon-webhook gehandhabt — skip
          console.log('[stripe-webhook] skip marketplace_addon (handled by other webhook)')
        } else {
          console.warn('[stripe-webhook] unknown flow:', flow)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await syncSubscription(supabase, sub)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(supabase, sub)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (inv.customer && typeof inv.customer === 'string') {
          await supabase
            .from('accounts')
            .update({ status: 'past_due' })
            .eq('stripe_customer_id', inv.customer)

          // Sprint L.6 — Event-Dispatch (statt Direct-Email aus K.2)
          try {
            const { data: acc } = await supabase
              .from('accounts')
              .select('id, plan_id')
              .eq('stripe_customer_id', inv.customer)
              .maybeSingle()

            if (acc?.id) {
              const amountEur = ((inv.amount_due || 0) / 100).toFixed(2).replace('.', ',')
              const nextRetryPretty = inv.next_payment_attempt
                ? new Date(inv.next_payment_attempt * 1000).toLocaleString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr'
                : 'manuell zu klären'

              let planName = 'dein Plan'
              if (acc.plan_id) {
                const { data: plan } = await supabase
                  .from('plans')
                  .select('name')
                  .eq('id', acc.plan_id)
                  .maybeSingle()
                if (plan?.name) planName = plan.name
              }

              await dispatchAccountStripeEvent(supabase, acc.id, 'stripe.invoice.payment_failed', {
                plan: { name: planName },
                amount_eur_pretty: `${amountEur} €`,
                next_retry_pretty: nextRetryPretty,
              })
            }
          } catch (e) {
            console.warn('[invoice.payment_failed] dispatch failed:', (e as Error).message)
          }
        }
        break
      }

      case 'invoice.paid': {
        // No-op — subscription-Update kommt via subscription.updated
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        // Refund auf eine one-shot credit_topup-Zahlung
        if (charge.payment_intent && typeof charge.payment_intent === 'string') {
          await supabase
            .from('credit_topups')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', charge.payment_intent)
        }
        break
      }

      default:
        console.log('[stripe-webhook] unhandled event type:', event.type)
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error:', (e as Error).message)
    return bad(500, 'handler error')
  }

  return ok()
})

// ─── Handler ────────────────────────────────────────────────────────────────

async function handlePlanSubscriptionCompleted(
  stripe: Stripe,
  supabase: any,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const accountId = meta.account_id
  const planSlug = meta.plan_slug
  const planId = meta.plan_id

  if (!accountId) {
    // Anonymous Buy-Now Flow (leadesk.de/pricing) — Sprint J.2 C.2
    await handleAnonymousPlanSubscriptionCompleted(stripe, supabase, session, meta)
    return
  }

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id

  // Update account: plan_id + status + stripe_subscription_id
  const { error: accErr } = await supabase
    .from('accounts')
    .update({
      plan_id: planId,
      status: 'active',
      stripe_subscription_id: subId,
      stripe_customer_id: customerId,
    })
    .eq('id', accountId)

  if (accErr) {
    console.error('[plan-sub-completed] account update failed:', accErr.message)
    throw accErr
  }

  // Profiles auch syncen (Phase-3-Refactor noch nicht durch — beide Tabellen)
  await supabase
    .from('profiles')
    .update({ plan_id: planId, subscription_status: 'active' })
    .in('id',
      (await supabase
        .from('team_members')
        .select('user_id, teams!inner(account_id)')
        .eq('teams.account_id', accountId)
      ).data?.map((tm: any) => tm.user_id) || []
    )

  console.log(`[plan-sub-completed] account ${accountId} → plan ${planSlug}`)

  // Sprint L.6 — Event-Dispatch (statt Direct-Email aus K.2)
  try {
    const amountEur = ((session.amount_total || 0) / 100).toFixed(2).replace('.', ',')
    await dispatchAccountStripeEvent(supabase, accountId, 'stripe.subscription.started', {
      plan: {
        name: meta.plan_label || planSlug,
        period_label: meta.period === 'yearly' ? 'jährlich' : 'monatlich',
      },
      price_eur_pretty: `${amountEur} €`,
    })
  } catch (e) {
    console.warn('[plan-sub-completed] stripe.subscription.started dispatch failed:', (e as Error).message)
  }
}

async function handleCreditTopupCompleted(
  stripe: Stripe,
  supabase: any,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const accountId = meta.account_id
  const userId = meta.user_id
  const offerType = meta.offer_type
  const offerAmount = Number(meta.offer_amount || '0')
  const quantity = Number(meta.quantity || '1')
  const totalAmount = offerAmount * quantity

  if (!accountId || !offerType) {
    console.warn('[credit-topup-completed] missing metadata, skip')
    return
  }

  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  // INSERT credit_topups Row
  const { error } = await supabase
    .from('credit_topups')
    .insert({
      account_id: accountId,
      purchased_by_user_id: userId || null,
      type: offerType,
      amount: totalAmount,
      amount_remaining: totalAmount,
      price_eur: (session.amount_total || 0) / 100,
      currency: (session.currency || 'eur').toLowerCase(),
      stripe_payment_intent_id: paymentIntentId || null,
      stripe_invoice_id: typeof session.invoice === 'string' ? session.invoice : session.invoice?.id || null,
      status: 'active',
      is_recurring: offerType !== 'credits',
    })

  if (error) {
    console.error('[credit-topup-completed] insert credit_topups failed:', error.message)
    throw error
  }

  console.log(`[credit-topup-completed] account ${accountId} +${totalAmount} ${offerType}`)
}

async function syncSubscription(supabase: any, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) return

  const statusMap: Record<string, string> = {
    'active': 'active',
    'trialing': 'trialing',
    'past_due': 'past_due',
    'canceled': 'cancelled',
    'unpaid': 'past_due',
    'incomplete': 'pending',
    'incomplete_expired': 'cancelled',
  }
  const accountStatus = statusMap[sub.status] || sub.status

  await supabase
    .from('accounts')
    .update({
      status: accountStatus,
      stripe_subscription_id: sub.id,
    })
    .eq('stripe_customer_id', customerId)

  console.log(`[sub-updated] customer ${customerId} → status ${accountStatus}`)
}

async function handleSubscriptionDeleted(supabase: any, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) return

  // Account auf 'cancelled' + plan_id auf 'free' (= Post-Trial-Restricted)
  const { data: freePlan } = await supabase
    .from('plans')
    .select('id')
    .eq('slug', 'free')
    .eq('license_type', 'free')
    .maybeSingle()

  await supabase
    .from('accounts')
    .update({
      status: 'cancelled',
      plan_id: freePlan?.id || null,
      stripe_subscription_id: null,
    })
    .eq('stripe_customer_id', customerId)

  console.log(`[sub-deleted] customer ${customerId} → cancelled, downgraded to free`)

  // Sprint L.6 — Event-Dispatch (statt Direct-Email aus K.2)
  try {
    const { data: acc } = await supabase
      .from('accounts')
      .select('id, plan_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (acc?.id) {
      const subItemName = sub.items?.data?.[0]?.price?.product ? 'Plan' : 'Plan'
      const periodEndPretty = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'unbekannt'

      await dispatchAccountStripeEvent(supabase, acc.id, 'stripe.subscription.cancelled', {
        plan: { name: subItemName },
        period_end_pretty: periodEndPretty,
      })
    }
  } catch (e) {
    console.warn('[sub-deleted] stripe.subscription.cancelled dispatch failed:', (e as Error).message)
  }
}

// ─── Sprint J.2 C.2 — Anonymous Buy-Now Flow ─────────────────────────────────
//
// Flow: User auf leadesk.de/pricing klickt "Plan kaufen", tippt Email,
// zahlt via Stripe-Checkout (kein Leadesk-Login vorher). Stripe sendet
// checkout.session.completed mit account_id='' in metadata (kein eingeloggter
// User). Webhook muss:
//   1. Email aus session resolven
//   2. User in auth.users finden oder neu anlegen (email_confirm=true)
//      → handle_new_user-Trigger erstellt accounts/teams/profile (mit Trial-Plan)
//   3. account_id resolven (owner_user_id primary, team_members fallback)
//   4. UPDATE accounts: Trial-Plan → Bought-Plan + Stripe-IDs + status=active
//   5. Magic-Link generieren via auth.admin.generateLink
//   6. Branded Email via send-email-EF (Postmark) versenden — non-blocking

function getAppUrl(): string {
  const env = Deno.env.get('APP_ENV') || 'staging'
  return env === 'production'
    ? (Deno.env.get('APP_URL_PROD') || 'https://app.leadesk.de')
    : (Deno.env.get('APP_URL_STAGING') || 'https://staging.leadesk.de')
}

async function handleAnonymousPlanSubscriptionCompleted(
  stripe: Stripe,
  supabase: any,
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  // 1. Email-Resolution: session.customer_email > customer_details.email > stripe.customers.retrieve
  let email: string | null =
    session.customer_email ||
    session.customer_details?.email ||
    null

  if (!email && session.customer) {
    try {
      const custId = typeof session.customer === 'string' ? session.customer : session.customer.id
      const cust = await stripe.customers.retrieve(custId)
      if (!cust.deleted) email = (cust as Stripe.Customer).email || null
    } catch (e) {
      console.warn('[anon-flow] stripe.customers.retrieve failed:', (e as Error).message)
    }
  }

  if (!email) {
    console.warn('[anon-flow] no email resolvable from session — skipping (manual cleanup needed)')
    return
  }

  email = email.toLowerCase().trim()

  const planId = meta.plan_id
  const planSlug = meta.plan_slug
  const period = meta.period || 'monthly'
  const subId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id

  if (!planId || !planSlug) {
    console.error('[anon-flow] missing plan_id or plan_slug in metadata')
    throw new Error('missing plan metadata for anonymous flow')
  }

  // 2. User finden oder neu anlegen + account_id resolven
  const { userId, accountId, isNewUser } = await findOrCreateUserAndAccount(supabase, email)

  // 3. Idempotenz: wenn account.stripe_subscription_id schon = subId → re-delivery, skip
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('stripe_subscription_id, plan_id')
    .eq('id', accountId)
    .maybeSingle()

  if (existingAccount?.stripe_subscription_id === subId && existingAccount?.plan_id === planId) {
    console.log(`[anon-flow] subscription ${subId} already linked to account ${accountId} — idempotent skip`)
    return
  }

  // 4. UPDATE accounts: Trial → Paid Plan + Stripe-IDs
  const { error: accErr } = await supabase
    .from('accounts')
    .update({
      plan_id: planId,
      status: 'active',
      stripe_subscription_id: subId,
      stripe_customer_id: customerId,
      trial_ends_at: null, // Paid → kein Trial mehr
    })
    .eq('id', accountId)

  if (accErr) {
    console.error('[anon-flow] account update failed:', accErr.message)
    throw accErr
  }

  // 5. UPDATE profiles für owner-user (Phase-4-Refactor noch nicht durch — dual-write)
  await supabase
    .from('profiles')
    .update({ plan_id: planId, subscription_status: 'active' })
    .eq('id', userId)

  // 6. Plan-Name für Email
  const { data: plan } = await supabase
    .from('plans')
    .select('name')
    .eq('id', planId)
    .maybeSingle()
  const planName = plan?.name || planSlug

  // 7. Magic-Link generieren
  const appUrl = getAppUrl()
  let magicLink: string | null = null
  try {
    const { data, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${appUrl}/?welcome=1&plan=${encodeURIComponent(planSlug)}`,
      },
    })
    if (linkErr) throw linkErr
    magicLink = (data as any)?.properties?.action_link || null
  } catch (e) {
    console.warn('[anon-flow] magic-link generation failed:', (e as Error).message)
  }

  // 8. Email senden via send-email-EF (non-blocking — DB-Update bleibt durch)
  try {
    const { error: emailErr } = await supabase.functions.invoke('send-email', {
      body: {
        to: email,
        subject: isNewUser
          ? `Willkommen bei Leadesk — ${planName} ist aktiv`
          : `${planName} wurde aktiviert`,
        html_body: buildBuyNowEmailHtml({
          planName,
          magicLink,
          isNewUser,
          period,
          appUrl,
        }),
        tag: isNewUser ? 'stripe-buy-now-new-user' : 'stripe-buy-now-existing-user',
        metadata: {
          plan_slug: planSlug,
          period,
          is_new_user: String(isNewUser),
          stripe_subscription_id: subId || '',
        },
      },
    })
    if (emailErr) {
      console.error('[anon-flow] send-email failed:', emailErr.message)
    }
  } catch (e) {
    console.error('[anon-flow] send-email invoke threw:', (e as Error).message)
  }

  console.log(
    `[anon-flow] ${isNewUser ? 'NEW' : 'EXISTING'} user ${userId} → account ${accountId} → plan ${planSlug} (${period})`,
  )
}

async function findOrCreateUserAndAccount(
  supabase: any,
  email: string,
): Promise<{ userId: string; accountId: string; isNewUser: boolean }> {
  // 1. Versuche createUser — wenn user existiert, errors mit "already" / "exists" / "registered"
  let userId: string
  let isNewUser = false

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // Stripe hat Email via Hosted-Checkout validiert
    user_metadata: { source: 'leadesk_marketing_buy_now' },
  })

  if (createErr) {
    const msg = (createErr.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      // User existiert — finde via listUsers (paginated, max 1000 — siehe TODO unten)
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      if (listErr) throw listErr
      const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email)
      if (!found) {
        // TODO: bei >1000 Users über Pagination iterieren oder SECURITY-DEFINER-RPC
        // get_user_id_by_email anlegen. Aktuell ausreichend.
        throw new Error(
          `[anon-flow] User mit email ${email} existiert laut createUser, aber nicht in listUsers (page 1, perPage 1000) — pagination-Limit erreicht?`,
        )
      }
      userId = found.id
    } else {
      throw createErr
    }
  } else {
    userId = created.user!.id
    isNewUser = true
    // Wait für handle_new_user-Trigger (accounts/teams/team_members/profiles Auto-Anlage)
    await new Promise((r) => setTimeout(r, 800))
  }

  // 2. account_id resolven — primary: accounts.owner_user_id, fallback: team_members → teams
  let accountId: string | null = null

  const { data: ownedAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (ownedAccount) {
    accountId = ownedAccount.id
  } else {
    const { data: tm } = await supabase
      .from('team_members')
      .select('teams!inner(account_id)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    accountId = (tm as any)?.teams?.account_id || null
  }

  if (!accountId) {
    throw new Error(
      `[anon-flow] account_id resolution failed for user ${userId} (email: ${email}). handle_new_user trigger may have crashed — check edge function logs.`,
    )
  }

  return { userId, accountId, isNewUser }
}

function buildBuyNowEmailHtml(params: {
  planName: string
  magicLink: string | null
  isNewUser: boolean
  period: string
  appUrl: string
}): string {
  const { planName, magicLink, isNewUser, period, appUrl } = params
  const periodLabel = period === 'yearly' ? 'jährlich' : 'monatlich'
  const loginCtaUrl = magicLink || appUrl
  const loginCtaLabel = magicLink ? 'Bei Leadesk einloggen' : 'Zu Leadesk'

  const linkNote = magicLink
    ? `<p style="font-size: 13px; color: #6B7280;">Der Login-Link ist 1 Stunde gültig. Falls er abläuft, kannst du jederzeit unter <a href="${appUrl}" style="color: rgb(49,90,231);">${appUrl.replace('https://', '')}</a> einen neuen Magic-Link anfordern.</p>`
    : `<p style="font-size: 13px; color: #6B7280;">Logge dich unter <a href="${appUrl}" style="color: rgb(49,90,231);">${appUrl.replace('https://', '')}</a> ein.</p>`

  const greeting = isNewUser
    ? `<h1 style="font-size: 24px; margin: 0 0 12px; color: #111827;">Willkommen bei Leadesk! 🎉</h1>
       <p style="font-size: 16px; color: #111827; margin: 0 0 8px;">Dein <strong>${escapeHtml(planName)}</strong>-Plan (${periodLabel} abgerechnet) ist ab sofort aktiv.</p>
       <p style="font-size: 14px; color: #4B5563; margin: 0 0 24px;">Wir haben ein Konto für dich angelegt. Über den Button unten kommst du beim ersten Mal direkt ins Dashboard — ohne Passwort.</p>`
    : `<h1 style="font-size: 24px; margin: 0 0 12px; color: #111827;">Plan aktiviert ✓</h1>
       <p style="font-size: 16px; color: #111827; margin: 0 0 8px;">Dein <strong>${escapeHtml(planName)}</strong>-Plan (${periodLabel} abgerechnet) ist auf deinem Leadesk-Account aktiv.</p>
       <p style="font-size: 14px; color: #4B5563; margin: 0 0 24px;">Du kannst dich wie gewohnt mit deinen Login-Daten einloggen — oder einmalig über den Magic-Link unten.</p>`

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>Leadesk</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #F9FAFB; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 40px auto; background: #FFFFFF; border-radius: 16px; padding: 32px;">
    ${greeting}
    <p style="margin: 24px 0;">
      <a href="${loginCtaUrl}" style="display: inline-block; background: rgb(49,90,231); color: #FFFFFF; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
        ${loginCtaLabel}
      </a>
    </p>
    ${linkNote}
    <hr style="border: none; border-top: 1px solid #E4E7EC; margin: 32px 0;">
    <p style="font-size: 12px; color: #6B7280; margin: 0;">Leadesk GbR · LinkedIn-Suite für B2B-Sales<br><a href="https://leadesk.de" style="color: #6B7280; text-decoration: none;">leadesk.de</a></p>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Sprint L.6 — Stripe-Event-Dispatcher-Helper ─────────────────────────────
//
// Ersetzt sendAccountLifecycleEmail aus K.2: ruft public.dispatch_email_event-RPC
// statt direct send-templated-email-EF. Workflow-System (L.4) ist die
// single-source-of-truth für Email-Routing.
//
// Vorteil: User kann via admin.leadesk.de/email-workflows Stripe-Events
// freischalten/deaktivieren oder zusätzliche Steps (Wait/Branch) anhängen.

async function dispatchAccountStripeEvent(
  supabase: any,
  accountId: string,
  eventName: string,
  extraVariables: Record<string, any>,
): Promise<void> {
  // 1. Account-Lookup für billing_email + owner_user_id
  const { data: acc } = await supabase
    .from('accounts')
    .select('id, owner_user_id, billing_email')
    .eq('id', accountId)
    .maybeSingle()

  if (!acc?.billing_email) {
    console.warn(`[stripe-dispatch] no billing_email for account ${accountId} — skip ${eventName}`)
    return
  }

  // 2. first_name resolven via profiles
  let firstName = 'Hallo'
  if (acc.owner_user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', acc.owner_user_id)
      .maybeSingle()

    if (profile?.full_name) {
      firstName = profile.full_name.trim().split(/\s+/)[0] || firstName
    } else if (profile?.email) {
      firstName = profile.email.split('@')[0]
    } else if (acc.billing_email) {
      firstName = acc.billing_email.split('@')[0]
    }
  }

  // 3. Variables-Merge (user-context + extra Stripe-Variables)
  const variables = {
    user: { first_name: firstName },
    ...extraVariables,
  }

  // 4. dispatch_email_event-RPC aufrufen
  const { data, error } = await supabase.rpc('dispatch_email_event', {
    p_event_name: eventName,
    p_user_id: acc.owner_user_id,
    p_account_id: acc.id,
    p_recipient_email: acc.billing_email,
    p_variables: variables,
  })

  if (error) {
    console.error(`[stripe-dispatch] dispatch_email_event(${eventName}) failed:`, error.message)
  } else {
    console.log(`[stripe-dispatch] dispatched ${eventName} for account ${accountId} → ${data} workflows triggered`)
  }
}
