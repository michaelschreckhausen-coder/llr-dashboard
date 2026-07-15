// Transformiert Beitragstext + gespeicherte @-Mentions in das jeweilige Zielformat.
// Gespeichert wird der Text mit sichtbarem "@Anzeigename"; die Mentions-Liste hält
// {name, provider_id, entity_type}. Beim Publish wird pro Mention die ERSTE noch
// nicht ersetzte Vorkommnis von "@Name" transformiert (der Ersatz enthält kein
// "@Name" mehr, daher findet die nächste gleiche Mention automatisch die nächste Stelle).

export type PostMention = { name: string; provider_id: string; entity_type?: string | null };

function sanitize(list: unknown): PostMention[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((m: any) => ({
      name: typeof m?.name === "string" ? m.name.trim() : "",
      provider_id: typeof m?.provider_id === "string" ? m.provider_id.trim() : "",
      entity_type: m?.entity_type ?? "person",
    }))
    .filter((m) => m.name && m.provider_id);
}

// Native LinkedIn Posts-API commentary: @{urn:li:person:ID|Name} bzw. organization.
export function buildNativeCommentary(text: string, rawMentions: unknown): string {
  const mentions = sanitize(rawMentions);
  if (!mentions.length) return text;
  let out = text;
  for (const m of mentions) {
    const token = "@" + m.name;
    const idx = out.indexOf(token);
    if (idx === -1) continue;
    const urnType = m.entity_type === "company" ? "organization" : "person";
    const repl = `@{urn:li:${urnType}:${m.provider_id}|${m.name}}`;
    out = out.slice(0, idx) + repl + out.slice(idx + token.length);
  }
  return out;
}

// Unipile: Text mit {{index}}-Platzhaltern + paralleles mentions-Array [{name, profile_id}].
export function buildUnipileText(
  text: string,
  rawMentions: unknown,
): { text: string; mentions: { name: string; profile_id: string }[] } {
  const mentions = sanitize(rawMentions);
  if (!mentions.length) return { text, mentions: [] };
  let out = text;
  const arr: { name: string; profile_id: string }[] = [];
  for (const m of mentions) {
    const token = "@" + m.name;
    const idx = out.indexOf(token);
    if (idx === -1) continue;
    const i = arr.length;
    out = out.slice(0, idx) + `{{${i}}}` + out.slice(idx + token.length);
    arr.push({ name: m.name, profile_id: m.provider_id });
  }
  return { text: out, mentions: arr };
}
