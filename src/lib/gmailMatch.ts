/** Čisté (testovatelné) funkce pro párování Gmail zpráv na CRM záznamy — odděleně od
 * gmailSync.ts, který kolem nich dělá skutečná síťová/DB volání. */

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Vytáhne e-mailové adresy z hlavičky typu From/To/Cc (např. `"Jan Novák" <jan@example.com>, info@x.cz`). */
export function extractEmailAddresses(headerValue: string | null | undefined): string[] {
  if (!headerValue) return [];
  const matches = headerValue.match(EMAIL_PATTERN) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

export interface MatchableRecord {
  entityType: string;
  id: string;
  email: string;
}

export interface EntityMatch {
  entityType: string;
  entityId: string;
}

/** Spáruje adresy nalezené v e-mailu (From+To+Cc dohromady) na CRM záznamy podle e-mailu
 * (case-insensitive). Jeden e-mail může spárovat víc záznamů (kontakt i jeho firma zároveň) —
 * vrací všechny, deduplikované podle entity+id. */
export function matchRecordsByEmail(
  participantEmails: string[],
  candidates: MatchableRecord[],
): EntityMatch[] {
  const wanted = new Set(participantEmails.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const matches: EntityMatch[] = [];
  for (const candidate of candidates) {
    if (!candidate.email) continue;
    if (!wanted.has(candidate.email.toLowerCase())) continue;
    const key = `${candidate.entityType}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ entityType: candidate.entityType, entityId: candidate.id });
  }
  return matches;
}
