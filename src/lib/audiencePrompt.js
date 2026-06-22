// Client-Mirror der Zielgruppen- und Wissens-Prompt-Builder
// (Server-Pendant: supabase/functions/_shared/brandPrompt.ts).
// Werden NUR genutzt, wenn Zielgruppe/Wissen explizit per Dropdown ausgewählt wurden.

import { STRIKE2_STEPS } from './strike2QuestionsCatalog'

function section(title, lines) {
  const real = lines.filter(Boolean)
  if (!real.length) return ''
  return title + '\n' + real.join('\n')
}

export function buildAudiencePrompt(aud) {
  if (!aud) return ''
  const intro = '## Zielgruppe — für genau diese Empfänger schreiben\n'
    + 'Richte Relevanz, Beispiele, Argumente und Sprache auf diese Empfänger aus und sprich ihre Pain Points an. Beschreibe die Zielgruppe NICHT im Text — nutze das Wissen, um sie zu treffen.'
  const wer = section('# Wer sie sind', [
    aud.name ? `- Name: ${aud.name}` : '',
    aud.job_titles ? `- Rollen / Positionen: ${aud.job_titles}` : '',
    aud.industries ? `- Branchen: ${aud.industries}` : '',
    aud.company_size ? `- Unternehmensgröße: ${aud.company_size}` : '',
    aud.decision_level ? `- Entscheidungsebene: ${aud.decision_level}` : '',
    aud.region ? `- Region / Markt: ${aud.region}` : '',
  ])
  const bewegt = section('# Was sie bewegt (hier inhaltlich andocken)', [
    aud.pain_points ? `- Pain Points:\n${aud.pain_points}` : '',
    aud.needs_goals ? `- Bedürfnisse / Ziele:\n${aud.needs_goals}` : '',
    aud.topics_interests ? `- Themen / Interessen: ${aud.topics_interests}` : '',
    aud.trigger_events ? `- Trigger-Events / Anlässe:\n${aud.trigger_events}` : '',
  ])
  const ansprache = section('# Ansprache', [
    aud.outreach_tips ? `- Ansprache-Tipps (Dos & Don’ts im Erstkontakt):\n${aud.outreach_tips}` : '',
    aud.hobbies ? `- Hobbies / Interessen außerhalb des Berufs (taugen für Hooks/Aufhänger): ${aud.hobbies}` : '',
  ])
  return [intro, wer, bewegt, ansprache].filter(Boolean).join('\n\n')
}

export function buildKnowledgePrompt(items) {
  if (!Array.isArray(items) || !items.length) return ''
  const L = [
    '## Wissensressourcen — Faktengrundlage',
    'Nutze die folgenden Inhalte als inhaltliche Grundlage und Belege. Beziehe dich konkret darauf wo relevant; erfinde KEINE Zahlen, Fakten oder Referenzen, die hier nicht stehen.',
  ]
  for (const k of items) {
    if (!k) continue
    L.push(`### ${k.name || 'Ressource'}${k.category ? ` (${k.category})` : ''}`)
    const prod = []
    if (k.product_kind) prod.push(`Art: ${k.product_kind}`)
    if (k.product_form) prod.push(`Form: ${k.product_form}`)
    if (k.price) prod.push(`Preis: ${k.price}`)
    if (prod.length) L.push(prod.join(' · '))
    if (k.description) L.push(k.description)
    if (k.content) {
      const snippet = k.content.length > 6000 ? k.content.slice(0, 6000) + '… [gekürzt]' : k.content
      L.push(snippet)
    }
  }
  return L.join('\n')
}


// ─── Strike2-Tiefen-Zielgruppe (Buyer-Persona nach Schuster-Modell) ──────────
// Rendert ALLE erfassten Grunddaten + alle Funnel-Phasen-Antworten als
// verbindlichen Zielgruppen-Kontext. Nutzt die Labels aus STRIKE2_STEPS, damit
// wirklich jeder eingegebene Input in die Generierung einfließt.
function s2fmt(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.filter(x => x != null && String(x).trim()).join(', ')
  return String(v).trim()
}

export function buildStrike2AudiencePrompt(persona) {
  if (!persona) return ''
  const g = persona.persona_grunddaten || {}
  const a = persona.antworten || {}
  const out = [
    '## Zielgruppe (Strike2-Tiefenprofil) — fuer genau diese Empfaenger schreiben',
    'Dies ist ein detailliertes B2B-Kaeuferprofil nach dem Schuster-Modell / Empathischer Funnel. Nutze JEDEN der folgenden Punkte, um Relevanz, Hook, Argumente, Sprache, Beispiele und Einwandbehandlung exakt auf diese Person auszurichten. Beschreibe die Zielgruppe NICHT im Text — triff sie.',
  ]
  for (const step of (STRIKE2_STEPS || [])) {
    if (step.tag === 'REVIEW' || !Array.isArray(step.questions) || step.questions.length === 0) continue
    const vals = step.store === 'grunddaten' ? g : (a[step.tag] || {})
    const lines = []
    for (const q of step.questions) {
      const val = s2fmt(vals[q.key])
      if (!val) continue
      lines.push(val.includes('\n') ? `- ${q.label}:\n${val}` : `- ${q.label}: ${val}`)
    }
    if (lines.length) out.push(`# ${step.title}${step.subtitle ? ` (${step.subtitle})` : ''}\n${lines.join('\n')}`)
  }
  return out.length > 2 ? out.join('\n\n') : ''
}
