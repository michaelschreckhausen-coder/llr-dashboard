// Ambassador-Modell: Company-Brand-Kontext für client-seitig gebaute Prompts.
// Persona/Personal Brand liefert die STIMME, der Company Brand liefert FAKTEN,
// Marke und Themenkontext. Server-seitige Prompts (text-werkstatt-chat) haben
// ihr eigenes Pendant (buildCompanyBrandContext) in der Edge Function.
import { supabase } from './supabase'

export function buildCompanyPromptBlock(bv) {
  if (!bv) return ''
  const L = ['UNTERNEHMENS-KONTEXT (Ambassador-Modell):',
    'Der Autor schreibt in seiner PERSÖNLICHEN Stimme (siehe Brand-Voice-Kontext), aber als Ambassador für dieses Unternehmen. Unternehmensinfos = inhaltlicher Kontext, NICHT Tonalität.']
  if (bv.brand_name || bv.name) L.push(`Unternehmen: ${bv.brand_name || bv.name}`)
  if (bv.brand_background) L.push(`Hintergrund: ${bv.brand_background}`)
  if (bv.mission) L.push(`Mission: ${bv.mission}`)
  if (bv.vision) L.push(`Vision: ${bv.vision}`)
  if (bv.values) L.push(`Werte: ${bv.values}`)
  if (bv.target_audience) L.push(`Zielgruppe des Unternehmens: ${bv.target_audience}`)
  if (Array.isArray(bv.vocabulary) && bv.vocabulary.length) L.push(`Schlüsselbegriffe: ${bv.vocabulary.join(', ')}`)
  if (bv.ai_summary) L.push(`Marken-Zusammenfassung: ${bv.ai_summary}`)
  return L.join('\n') + '\n'
}

// Lädt die volle BV-Row (Context-Provider hält nur eine Teilmenge der Felder)
export async function fetchCompanyPromptBlock(companyVoiceId) {
  if (!companyVoiceId) return ''
  const { data } = await supabase.from('brand_voices').select('*').eq('id', companyVoiceId).maybeSingle()
  return buildCompanyPromptBlock(data)
}

// Mehrere Company Brands: Blöcke für alle gewählten IDs laden und zusammenfügen.
// (Kombiniertes Ergebnis: alle Unternehmenskontexte fließen in EINE Generierung.)
export async function fetchCompanyPromptBlocks(companyVoiceIds) {
  const ids = Array.from(new Set((companyVoiceIds || []).filter(Boolean)))
  if (!ids.length) return ''
  const { data } = await supabase.from('brand_voices').select('*').in('id', ids)
  return (data || []).map(buildCompanyPromptBlock).filter(Boolean).join('\n')
}
