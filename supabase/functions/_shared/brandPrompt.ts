// supabase/functions/_shared/brandPrompt.ts
// Vollständige Prompt-Builder für Brand Voices.
// Es gibt ZWEI dedizierte Builder, die per account_type dispatcht werden:
//   - buildPersonalBrandPrompt  → greift wenn eine Personal Brand zur Generierung aktiv ist
//   - buildCompanyBrandPrompt   → greift wenn eine Company Brand zur Generierung aktiv ist
// Beide berücksichtigen ALLE Felder der jeweiligen Brand. ai_summary wird bewusst
// NICHT mehr genutzt — die strukturierten Felder fließen vollständig ein.

type BV = Record<string, any>;

function tonalityLine(t: any): string {
  if (!t || typeof t !== "object" || Array.isArray(t)) return "";
  const pairs = Object.entries(t).filter(([k, v]) => k && (v || v === 0));
  if (!pairs.length) return "";
  return pairs.map(([k, v]) => `${k}: ${v}%`).join(", ");
}

function glossaryLines(g: any): string {
  if (!Array.isArray(g) || !g.length) return "";
  return g
    .filter((x: any) => x && (x.term || x.definition))
    .map((x: any) => `- ${x.term}: ${x.definition}`)
    .join("\n");
}

function linkedinStyleLines(ls: any): string[] {
  if (!ls || typeof ls !== "object") return [];
  const out: string[] = [];
  if (ls.hook_style) out.push(`Hook-Stil: ${ls.hook_style}`);
  if (ls.cta_style) out.push(`CTA-Stil: ${ls.cta_style}`);
  if (ls.emoji_usage) out.push(`Emoji-Nutzung: ${ls.emoji_usage}`);
  if (ls.structure_preference) out.push(`Bevorzugte Post-Struktur: ${ls.structure_preference}`);
  return out;
}

function formalityLine(f: any): string {
  if (f === "du") return "Ansprache: Du-Form (persönlich, nahbar)";
  if (f === "sie") return "Ansprache: Sie-Form (formell)";
  if (f === "mixed") return "Ansprache: gemischt, je nach Kontext";
  return "";
}

export function buildPersonalBrandPrompt(bv: BV): string {
  if (!bv) return "";
  const L: string[] = ["## Personal Brand (du schreibst als genau diese Person — niemals generisch)"];
  if (bv.brand_name) L.push(`Name / Anzeigename: ${bv.brand_name}`);
  if (bv.brand_background) L.push(`Hintergrund: ${bv.brand_background}`);
  if (bv.mission) L.push(`Mission: ${bv.mission}`);
  if (bv.vision) L.push(`Vision: ${bv.vision}`);
  if (bv.values) L.push(`Werte: ${bv.values}`);
  if (bv.personality) L.push(`Stimme / Persönlichkeit: ${bv.personality}`);
  const ton = tonalityLine(bv.tonality);
  if (ton) L.push(`Tonalität (Intensität je Merkmal, 0-100%): ${ton}`);
  else if (Array.isArray(bv.tone_attributes) && bv.tone_attributes.length) L.push(`Tonalität: ${bv.tone_attributes.join(", ")}`);
  const form = formalityLine(bv.formality);
  if (form) L.push(form);
  if (bv.word_choice) L.push(`Wortwahl: ${bv.word_choice}`);
  if (bv.sentence_style) L.push(`Satzstruktur: ${bv.sentence_style}`);
  if (Array.isArray(bv.vocabulary) && bv.vocabulary.length) L.push(`Schlüsselbegriffe (bevorzugt verwenden): ${bv.vocabulary.join(", ")}`);
  const glo = glossaryLines(bv.glossary);
  if (glo) L.push(`Glossar (so verwendet die Person diese Begriffe):\n${glo}`);
  if (bv.dos) L.push(`Dos:\n${bv.dos}`);
  if (bv.donts) L.push(`Don'ts:\n${bv.donts}`);
  const ls = linkedinStyleLines(bv.linkedin_style);
  if (ls.length) L.push(`LinkedIn-Stil:\n${ls.map((x) => "- " + x).join("\n")}`);
  if (bv.example_texts) L.push(`Beispiel-Texte (Stil-Referenz — Tonfall, Rhythmus & Struktur übernehmen, NICHT den Inhalt kopieren):\n${bv.example_texts}`);
  return L.join("\n");
}

export function buildCompanyBrandPrompt(bv: BV): string {
  if (!bv) return "";
  const L: string[] = ["## Company Brand (du schreibst als/für diese Unternehmensmarke — Wir-Form)"];
  if (bv.brand_name) L.push(`Unternehmen: ${bv.brand_name}`);
  if (bv.brand_background) L.push(`Hintergrund (Markt, Produkte, Kunden): ${bv.brand_background}`);
  if (bv.mission) L.push(`Mission: ${bv.mission}`);
  if (bv.vision) L.push(`Vision: ${bv.vision}`);
  if (bv.values) L.push(`Werte: ${bv.values}`);
  if (bv.personality) L.push(`Markencharakter: ${bv.personality}`);
  const ton = tonalityLine(bv.tonality);
  if (ton) L.push(`Tonalität (Intensität je Merkmal, 0-100%): ${ton}`);
  else if (Array.isArray(bv.tone_attributes) && bv.tone_attributes.length) L.push(`Tonalität: ${bv.tone_attributes.join(", ")}`);
  const form = formalityLine(bv.formality);
  if (form) L.push(form);
  if (bv.word_choice) L.push(`Wortwahl: ${bv.word_choice}`);
  if (bv.sentence_style) L.push(`Satzstruktur: ${bv.sentence_style}`);
  if (Array.isArray(bv.vocabulary) && bv.vocabulary.length) L.push(`Schlüsselbegriffe (bevorzugt verwenden): ${bv.vocabulary.join(", ")}`);
  const glo = glossaryLines(bv.glossary);
  if (glo) L.push(`Glossar (markeneigene Begriffsverwendung):\n${glo}`);
  if (bv.dos) L.push(`Dos:\n${bv.dos}`);
  if (bv.donts) L.push(`Don'ts:\n${bv.donts}`);
  const ls = linkedinStyleLines(bv.linkedin_style);
  if (ls.length) L.push(`LinkedIn-Stil:\n${ls.map((x) => "- " + x).join("\n")}`);
  if (bv.example_texts) L.push(`Beispiel-Texte (Stil-Referenz — Tonfall übernehmen, NICHT den Inhalt kopieren):\n${bv.example_texts}`);
  return L.join("\n");
}

// Dispatcher: wählt den Builder nach Brand-Typ.
export function buildBrandPrompt(bv: BV): string {
  if (!bv) return "";
  return bv.account_type === "company_page"
    ? buildCompanyBrandPrompt(bv)
    : buildPersonalBrandPrompt(bv);
}
