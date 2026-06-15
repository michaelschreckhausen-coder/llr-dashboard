// Client-Mirror der Zielgruppen- und Wissens-Prompt-Builder
// (Server-Pendant: supabase/functions/_shared/brandPrompt.ts).
// Werden NUR genutzt, wenn Zielgruppe/Wissen explizit per Dropdown ausgewählt wurden.

export function buildAudiencePrompt(aud) {
  if (!aud) return ''
  const L = ['## Zielgruppe (für genau diese Empfänger schreiben)']
  if (aud.name) L.push(`Name: ${aud.name}`)
  if (aud.job_titles) L.push(`Rollen / Positionen: ${aud.job_titles}`)
  if (aud.industries) L.push(`Branchen: ${aud.industries}`)
  if (aud.company_size) L.push(`Unternehmensgröße: ${aud.company_size}`)
  if (aud.decision_level) L.push(`Entscheidungsebene: ${aud.decision_level}`)
  if (aud.region) L.push(`Region / Markt: ${aud.region}`)
  if (aud.pain_points) L.push(`Pain Points:\n${aud.pain_points}`)
  if (aud.needs_goals) L.push(`Bedürfnisse / Ziele:\n${aud.needs_goals}`)
  if (aud.topics_interests) L.push(`Themen / Interessen: ${aud.topics_interests}`)
  if (aud.trigger_events) L.push(`Trigger-Events / Anlässe:\n${aud.trigger_events}`)
  if (aud.outreach_tips) L.push(`Ansprache-Tipps (Dos & Don'ts im Erstkontakt):\n${aud.outreach_tips}`)
  if (aud.hobbies) L.push(`Hobbies / Interessen außerhalb des Berufs: ${aud.hobbies}`)
  return L.join('\n')
}

export function buildKnowledgePrompt(items) {
  if (!Array.isArray(items) || !items.length) return ''
  const L = ['## Wissensressourcen (Fakten, Referenzen, Produktinfos — als Grundlage nutzen)']
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
