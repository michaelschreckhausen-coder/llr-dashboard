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

function section(title: string, lines: string[]): string {
  const real = lines.filter(Boolean);
  if (!real.length) return "";
  return title + "\n" + real.join("\n");
}

export function buildPersonalBrandPrompt(bv: BV): string {
  if (!bv) return "";
  const intro = "## Personal Brand — schreibe vollständig in dieser Stimme\n"
    + "Verfasse den Text, als käme er von genau dieser Person. Die Angaben unten definieren ihren Schreibstil und ihre Haltung: verkörpere sie, statt sie aufzuzählen oder wörtlich zu zitieren. Identität/Mission/Werte prägen Blickwinkel und Themenwahl; Stimme & Tonalität bestimmen das WIE; die Sprachregeln sind konkret zu befolgen; Dos/Don\u2019ts sind verbindlich; die Beispieltexte sind die wichtigste Stilreferenz.";

  const ton = tonalityLine(bv.tonality);
  const identitaet = section("# Wer schreibt (Haltung & Perspektive \u2014 prägt Blickwinkel und Themenwahl, NICHT wörtlich in den Text einbauen)", [
    bv.brand_name ? `- Name: ${bv.brand_name}` : "",
    bv.brand_background ? `- Hintergrund: ${bv.brand_background}` : "",
    bv.mission ? `- Mission: ${bv.mission}` : "",
    bv.vision ? `- Vision: ${bv.vision}` : "",
    bv.values ? `- Werte: ${bv.values}` : "",
  ]);
  const stimme = section("# Stimme & Tonalität (das WIE \u2014 so soll der Text klingen)", [
    bv.personality ? `- Persönlichkeit / Stimme: ${bv.personality}` : "",
    ton ? `- Tonalität (Intensität je Merkmal 0-100%, je höher desto stärker spürbar): ${ton}`
        : (Array.isArray(bv.tone_attributes) && bv.tone_attributes.length ? `- Tonalität: ${(bv.tone_attributes as string[]).join(", ")}` : ""),
    formalityLine(bv.formality) ? `- ${formalityLine(bv.formality)}` : "",
  ]);
  const glo = glossaryLines(bv.glossary);
  const sprache = section("# Sprachregeln (konkret befolgen)", [
    bv.word_choice ? `- Wortwahl: ${bv.word_choice}` : "",
    bv.sentence_style ? `- Satzstruktur & Rhythmus: ${bv.sentence_style}` : "",
    (Array.isArray(bv.vocabulary) && bv.vocabulary.length) ? `- Schlüsselbegriffe (wo es natürlich passt einbauen): ${(bv.vocabulary as string[]).join(", ")}` : "",
    glo ? `- Glossar (diese Begriffe genau so verwenden):\n${glo}` : "",
    bv.dos ? `- Dos (immer beachten):\n${bv.dos}` : "",
    bv.donts ? `- Don\u2019ts (nie tun):\n${bv.donts}` : "",
  ]);
  const ls = linkedinStyleLines(bv.linkedin_style);
  const format = ls.length ? section("# LinkedIn-Format (Hook, CTA, Emojis, Aufbau)", ls.map((x) => "- " + x)) : "";
  const beispiele = bv.example_texts
    ? "# Beispieltexte (WICHTIGSTE Stilreferenz \u2014 ahme Tonfall, Rhythmus, Satzbau und Aufbau nach; übernimm NICHT den Inhalt)\n" + bv.example_texts
    : "";

  return [intro, identitaet, stimme, sprache, format, beispiele].filter(Boolean).join("\n\n");
}

export function buildCompanyBrandPrompt(bv: BV): string {
  if (!bv) return "";
  const intro = "## Company Brand — schreibe vollständig in dieser Markenstimme (Wir-Form)\n"
    + "Verfasse den Text als diese Unternehmensmarke. Die Angaben unten definieren Stimme und Haltung der Marke: verkörpere sie, statt sie aufzuzählen. Hintergrund/Mission/Werte prägen Blickwinkel und Themenwahl; Stimme & Tonalität bestimmen das WIE; die Sprachregeln sind konkret zu befolgen; Dos/Don\u2019ts sind verbindlich; die Beispieltexte sind die wichtigste Stilreferenz.";

  const ton = tonalityLine(bv.tonality);
  const identitaet = section("# Wer schreibt (Marke, Haltung & Perspektive \u2014 prägt Blickwinkel und Themenwahl, NICHT wörtlich einbauen)", [
    bv.brand_name ? `- Unternehmen: ${bv.brand_name}` : "",
    bv.brand_background ? `- Hintergrund (Markt, Produkte, Kunden): ${bv.brand_background}` : "",
    bv.mission ? `- Mission: ${bv.mission}` : "",
    bv.vision ? `- Vision: ${bv.vision}` : "",
    bv.values ? `- Werte: ${bv.values}` : "",
  ]);
  const stimme = section("# Stimme & Tonalität (das WIE \u2014 so soll der Text klingen)", [
    bv.personality ? `- Markencharakter: ${bv.personality}` : "",
    ton ? `- Tonalität (Intensität je Merkmal 0-100%, je höher desto stärker spürbar): ${ton}`
        : (Array.isArray(bv.tone_attributes) && bv.tone_attributes.length ? `- Tonalität: ${(bv.tone_attributes as string[]).join(", ")}` : ""),
    formalityLine(bv.formality) ? `- ${formalityLine(bv.formality)}` : "",
  ]);
  const glo = glossaryLines(bv.glossary);
  const sprache = section("# Sprachregeln (konkret befolgen)", [
    bv.word_choice ? `- Wortwahl: ${bv.word_choice}` : "",
    bv.sentence_style ? `- Satzstruktur & Rhythmus: ${bv.sentence_style}` : "",
    (Array.isArray(bv.vocabulary) && bv.vocabulary.length) ? `- Schlüsselbegriffe (wo es natürlich passt einbauen): ${(bv.vocabulary as string[]).join(", ")}` : "",
    glo ? `- Glossar (markeneigene Begriffe genau so verwenden):\n${glo}` : "",
    bv.dos ? `- Dos (immer beachten):\n${bv.dos}` : "",
    bv.donts ? `- Don\u2019ts (nie tun):\n${bv.donts}` : "",
  ]);
  const ls = linkedinStyleLines(bv.linkedin_style);
  const format = ls.length ? section("# LinkedIn-Format (Hook, CTA, Emojis, Aufbau)", ls.map((x) => "- " + x)) : "";
  const beispiele = bv.example_texts
    ? "# Beispieltexte (WICHTIGSTE Stilreferenz \u2014 ahme Tonfall, Rhythmus, Satzbau und Aufbau nach; übernimm NICHT den Inhalt)\n" + bv.example_texts
    : "";

  return [intro, identitaet, stimme, sprache, format, beispiele].filter(Boolean).join("\n\n");
}

// Dispatcher: wählt den Builder nach Brand-Typ.
export function buildBrandPrompt(bv: BV): string {
  if (!bv) return "";
  return bv.account_type === "company_page"
    ? buildCompanyBrandPrompt(bv)
    : buildPersonalBrandPrompt(bv);
}

// ─── Zielgruppe & Wissen ────────────────────────────────────────────────────
// Werden NUR genutzt, wenn die Zielgruppe/Wissensressource explizit per Dropdown
// ausgewählt wurde (keine automatische Einspeisung der "aktiven" Zielgruppe).

export function buildAudiencePrompt(aud: BV): string {
  if (!aud) return "";
  const intro = "## Zielgruppe — für genau diese Empfänger schreiben\n"
    + "Richte Relevanz, Beispiele, Argumente und Sprache auf diese Empfänger aus und sprich ihre Pain Points an. Beschreibe die Zielgruppe NICHT im Text — nutze das Wissen, um sie zu treffen.";
  const wer = section("# Wer sie sind", [
    aud.name ? `- Name: ${aud.name}` : "",
    aud.job_titles ? `- Rollen / Positionen: ${aud.job_titles}` : "",
    aud.industries ? `- Branchen: ${aud.industries}` : "",
    aud.company_size ? `- Unternehmensgröße: ${aud.company_size}` : "",
    aud.decision_level ? `- Entscheidungsebene: ${aud.decision_level}` : "",
    aud.region ? `- Region / Markt: ${aud.region}` : "",
  ]);
  const bewegt = section("# Was sie bewegt (hier inhaltlich andocken)", [
    aud.pain_points ? `- Pain Points:\n${aud.pain_points}` : "",
    aud.needs_goals ? `- Bedürfnisse / Ziele:\n${aud.needs_goals}` : "",
    aud.topics_interests ? `- Themen / Interessen: ${aud.topics_interests}` : "",
    aud.trigger_events ? `- Trigger-Events / Anlässe:\n${aud.trigger_events}` : "",
  ]);
  const ansprache = section("# Ansprache", [
    aud.outreach_tips ? `- Ansprache-Tipps (Dos & Don\u2019ts im Erstkontakt):\n${aud.outreach_tips}` : "",
    aud.hobbies ? `- Hobbies / Interessen außerhalb des Berufs (taugen für Hooks/Aufhänger): ${aud.hobbies}` : "",
  ]);
  return [intro, wer, bewegt, ansprache].filter(Boolean).join("\n\n");
}

export function buildKnowledgePrompt(items: BV[]): string {
  if (!Array.isArray(items) || !items.length) return "";
  const L: string[] = [
    "## Wissensressourcen — Faktengrundlage",
    "Nutze die folgenden Inhalte als inhaltliche Grundlage und Belege. Beziehe dich konkret darauf wo relevant; erfinde KEINE Zahlen, Fakten oder Referenzen, die hier nicht stehen.",
  ];
  for (const k of items) {
    if (!k) continue;
    L.push(`### ${k.name || "Ressource"}${k.category ? ` (${k.category})` : ""}`);
    const prod: string[] = [];
    if (k.product_kind) prod.push(`Art: ${k.product_kind}`);
    if (k.product_form) prod.push(`Form: ${k.product_form}`);
    if (k.price) prod.push(`Preis: ${k.price}`);
    if (prod.length) L.push(prod.join(" \u00b7 "));
    if (k.description) L.push(k.description);
    if (k.content) {
      const snippet = k.content.length > 6000 ? k.content.slice(0, 6000) + "\u2026 [gekürzt]" : k.content;
      L.push(snippet);
    }
  }
  return L.join("\n");
}

// ─── Brand-Korpus: echte bisherige Inhalte als Stil-/Themen-Referenz ────────
// Zieht die letzten Posts (veröffentlichte zuerst) + Dokumente der Brand und
// baut daraus eine Few-Shot-Sektion. So lernt jede Generierung aus allem, was
// die Brand schon produziert hat (Beitragsthemen, Tonalität, Stil).
export async function buildBrandCorpus(admin: any, brandVoiceId: string): Promise<string> {
  if (!admin || !brandVoiceId) return "";
  try {
    const [postsRes, docsRes] = await Promise.all([
      admin.from("content_posts")
        .select("content, status, created_at")
        .eq("brand_voice_id", brandVoiceId)
        .not("content", "is", null)
        .order("created_at", { ascending: false })
        .limit(12),
      admin.from("content_documents")
        .select("content_text, updated_at")
        .eq("brand_voice_id", brandVoiceId)
        .not("content_text", "is", null)
        .order("updated_at", { ascending: false })
        .limit(6),
    ]);
    const rankPost = (p: any) => (p?.status === "published" ? 0 : (p?.status === "approved" || p?.status === "scheduled") ? 1 : 2);
    const postTexts = (postsRes?.data || [])
      .filter((p: any) => (p?.content || "").trim().length > 40)
      .sort((a: any, b: any) => rankPost(a) - rankPost(b))
      .slice(0, 3)
      .map((p: any) => (p.content || "").trim());
    const docTexts = (docsRes?.data || [])
      .filter((d: any) => (d?.content_text || "").trim().length > 40)
      .slice(0, 2)
      .map((d: any) => (d.content_text || "").trim());
    const all = [...postTexts, ...docTexts];
    if (!all.length) return "";
    let out = "## Bisherige Inhalte dieser Brand (echte Beispiele — Stil, Tonalität & Themen als Referenz, NICHT 1:1 kopieren):\n";
    all.forEach((t, i) => { out += "### Beispiel " + (i + 1) + "\n" + t.slice(0, 700) + "\n\n"; });
    return out.trim();
  } catch (_e) {
    return "";
  }
}


// ─── Globale Schreib-Guides (für ALLE Text-Generierungen) ──────────────────
// Recherche-basiert: LinkedIn-Best-Practices + Anti-KI-Stil. In Generatoren
// einbinden, damit Ergebnisse menschlich/authentisch wirken statt nach KI.

export const HUMAN_STYLE_GUIDE = `## So schreibst du: wie ein echter, sehr guter Mensch, NICHT wie eine KI
Der Text muss klingen, als hätte ihn ein erfahrener, richtig guter Schreiber verfasst, der die Zielgruppe versteht. Klassischer KI-Klang ist ein Fehler. Halte dich strikt an:

**Zeichensetzung (wichtigste Regel):**
- KEINE Gedankenstriche (— oder –) als Satzzeichen. Niemals. Nutze stattdessen Punkt, Komma, Doppelpunkt oder Klammern. Lieber zwei kurze Sätze als ein Satz mit Gedankenstrich.

**Verbotene KI-Floskeln und -Wörter (nicht verwenden):**
- Wörter: nahtlos, eintauchen, beleuchten, navigieren, revolutionieren, transformativ, befähigen, freischalten, ganzheitlich, Reise, Landschaft, Ökosystem, Leuchtturm, Game-Changer, "ein wahres Zeugnis für".
- Floskeln: "in der heutigen schnelllebigen Welt", "es ist wichtig zu beachten", "lass uns eintauchen", "zusammenfassend", "abschließend lässt sich sagen".
- Steife Übergänge (darüber hinaus, des Weiteren, folglich, zudem). Nutze natürliche Verbinder: aber, und, also, trotzdem, weil.

**Satzbau (das stärkste Mittel gegen KI-Klang):**
- Variiere die Satzlänge stark. Mische sehr kurze Sätze (3-5 Wörter, manchmal nur ein Wort) mit längeren. Gleichförmige Sätze klingen maschinell.
- Aktiv statt Passiv. Konkret statt abstrakt. Eine echte Beobachtung oder ein Beispiel schlägt jede allgemeine Wahrheit.
- Natürliche, gesprochene Sprache mit kleinen Unregelmäßigkeiten. Keine perfekt geglättete Lehrbuch-Prosa.
- Kein "Fazit:" und keine Zusammenfassung am Ende.

**Haltung:**
- Schreibe mit Standpunkt und aus echter Erfahrung. Verkörpere die Brand Voice, statt Eigenschaften aufzuzählen oder über sie zu reden.`;

export const LINKEDIN_POST_GUIDE = `## LinkedIn-Handwerk: so baust du einen Beitrag, der gelesen wird
- Hook: Die ersten 1-2 Zeilen (ca. 200 Zeichen) entscheiden alles, sie stehen vor dem "…mehr". Starte mit einer starken, konkreten oder überraschenden Aussage, einer Gegenthese oder einer Zahl. Keine Aufwärmsätze, kein "In diesem Beitrag".
- Länge: Sweet Spot ca. 900 bis 1600 Zeichen. Prägnant schlägt lang. Über ~2500 Zeichen sinkt die Reichweite. Lieber ein Gedanke, klar zu Ende gebracht.
- Aufbau: Hook, dann kurzer Kontext/Spannung, dann 1-2 konkrete Insights oder eine kleine Geschichte, dann die Kernaussage, am Ende EINE echte offene Frage an die Zielgruppe (treibt Kommentare).
- Formatierung: kurze Absätze (oft 1-2 Sätze), dann Leerzeile. Viel Weißraum, gut auf dem Smartphone lesbar.
- Wert: echtes Wissen und Erfahrung teilen (LinkedIn bevorzugt "knowledge & advice"). Kein Werbesprech, kein generischer Motivationston.
- Emojis sehr sparsam (0-2, nur wenn es zur Brand Voice passt). Keine Hashtag-Wand (höchstens 0-3 wirklich relevante).`;

// Server-seitiger Backstop: entfernt Gedankenstriche als Satzzeichen (inline,
// space-umgeben), ohne Zahlenbereiche (10–20) oder Listen-Bullets am Zeilenanfang
// zu zerstören. Der Prompt verhindert sie primär; dies fängt Reste ab.
export function stripEmDashes(s: string): string {
  if (!s) return s;
  return String(s)
    .replace(/[^\S\r\n]+[—–][^\S\r\n]+/g, ", ")  // " — " / " – " inline → Komma
    .replace(/[^\S\r\n]*[—–][^\S\r\n]*$/gm, "")    // Strich am Zeilenende → weg
    .replace(/[ \t]+,/g, ",")
    .replace(/,[ \t]*,/g, ",");
}
