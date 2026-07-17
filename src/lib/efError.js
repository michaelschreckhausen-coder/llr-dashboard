// efError — EINE zentrale EF-Status→Mensch-Übersetzung für supabase.functions.invoke-Fehler.
// Ersetzt die pro-Seite duplizierten "status===403 || no_addon"-Blöcke und die kryptische
// "Edge Function returned a non-2xx status code"-Box. Deckt ALLE Connect-/Feature-403/401-
// Fälle an einer Stelle ab (P3 Schritt 4).
//
// Nutzung:
//   const { data, error } = await supabase.functions.invoke(...)
//   if (error) { const m = await mapEfError(error); setFlash({ type:'error', text:m.text, action:m.action }); return }
//
// Rückgabe: { kind, type:'error', text, action? }
//   action = { label, to } → optionales Navigate-Ziel (nur wo sinnvoll; sonst nur text).

export async function mapEfError(error) {
  // functions.invoke legt den non-2xx-Body in error.context (Response) ab.
  let body = null
  try { body = await error?.context?.json?.() } catch { /* Body evtl. schon konsumiert / kein JSON */ }
  const status = error?.context?.status ?? error?.status ?? null

  // 401 → Sitzung abgelaufen (Schenk-Fall: Connect-Klick ohne gültiges Session-JWT).
  // Text-only (selbsterklärend) — kein Action-Button nötig.
  if (status === 401 || body?.error === 'unauthorized') {
    return { kind: 'session', type: 'error', text: 'Deine Sitzung ist abgelaufen. Bitte lade die Seite neu und logge dich ggf. erneut ein.' }
  }
  // 403 / Entitlement → Upgrade nötig.
  //   need_permission = P3-Permission-Gate · no_addon = Alt-Addon-Gate · need_active_plan = Connect/Seat
  if ((status === 403 && (body?.error === 'need_permission' || body?.error === 'no_addon')) || body?.error === 'need_active_plan') {
    return {
      kind: 'upgrade', type: 'error',
      text: 'Für diese Funktion ist ein Upgrade deines Plans nötig.',
      action: { label: 'Plan ändern', to: '/settings/konto' },
    }
  }
  // 409 → kein verbundener LinkedIn-Account.
  if (status === 409) {
    return {
      kind: 'no_connection', type: 'error',
      text: 'Kein aktiver LinkedIn-Account verbunden.',
      action: { label: 'LinkedIn verbinden', to: '/settings/linkedin' },
    }
  }
  // 429 → Rate-Limit.
  if (status === 429 || body?.rate_limited) {
    return { kind: 'rate_limit', type: 'error', text: 'LinkedIn-Rate-Limit erreicht — bitte später erneut versuchen.' }
  }
  // Fallback: lesbar statt "non-2xx".
  return { kind: 'generic', type: 'error', text: body?.message || body?.error || 'Etwas ist schiefgelaufen. Bitte erneut versuchen.' }
}
