// ARES (Administrativní registr ekonomických subjektů) — veřejné REST API českého
// Ministerstva financí, bez klíče/autentizace. Používá se k předvyplnění údajů o firmě
// na Obchodním vztahu podle IČO nebo části názvu. Zdroj pravdy pro tvar odpovědi:
// https://ares.gov.cz/swagger-ui/ (POST /ekonomicke-subjekty/vyhledat, GET /ekonomicke-subjekty/{ico}).
const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

interface AresSidlo {
  textovaAdresa?: string;
}

interface AresSubject {
  ico: string;
  obchodniJmeno: string;
  sidlo?: AresSidlo;
}

interface AresSearchResponse {
  ekonomickeSubjekty?: AresSubject[];
}

export interface AresMatch {
  ico: string;
  name: string;
  address: string | null;
}

export function toAresMatch(subject: AresSubject): AresMatch {
  return { ico: subject.ico, name: subject.obchodniJmeno, address: subject.sidlo?.textovaAdresa ?? null };
}

const REQUEST_TIMEOUT_MS = 5000;

/** Přesné vyhledání podle IČO (8 číslic) — `null`, pokud subjekt neexistuje. */
export async function lookupAresByIco(ico: string): Promise<AresMatch | null> {
  const res = await fetch(`${ARES_BASE}/${ico}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ARES vrátilo chybu (${res.status}).`);
  return toAresMatch((await res.json()) as AresSubject);
}

/** Vyhledání podle (části) obchodního jména — vrací nejvýš `limit` shod. */
export async function searchAresByName(name: string, limit = 10): Promise<AresMatch[]> {
  const res = await fetch(`${ARES_BASE}/vyhledat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ obchodniJmeno: name, pocet: limit, start: 0 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ARES vrátilo chybu (${res.status}).`);
  const data = (await res.json()) as AresSearchResponse;
  return (data.ekonomickeSubjekty ?? []).map(toAresMatch);
}
