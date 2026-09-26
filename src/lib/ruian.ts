// RÚIAN (Registr územní identifikace, adres a nemovitostí) přes geokódovací službu ČÚZK —
// veřejné ArcGIS REST API, bez klíče a bez limitu. Zdroj pravdy pro tvar odpovědi:
// https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/exts/GeocodeSOE
//
// Stejně jako u ARES nic nezrcadlíme do vlastní databáze — RÚIAN má přes 3 miliony adresních
// bodů a měsíční aktualizace, proxovat dotaz je levnější i přesnější než udržovat kopii.
const GEOCODE_BASE = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/exts/GeocodeSOE";
const REQUEST_TIMEOUT_MS = 6000;

/** Adresu umí doplnit jen tenhle typ; `suggest` do stejného seznamu míchá i obce, ulice
 * a katastrální území, které vlastní adresní bod nemají. */
const ADDRESS_TYPE = "AdresniMisto";

export interface RuianSuggestion {
  /** Celý řetězec tak, jak ho vrací ČÚZK — zobrazuje se v nabídce. */
  text: string;
  /** Neprůhledný klíč ČÚZK; posílá se zpátky do `findAddressCandidates` místo textu. */
  magicKey: string;
}

export interface RuianAddress {
  /** Celá adresa na jeden řádek (`Match_addr`) — pro zobrazení a kontrolu. */
  label: string;
  street: string | null;
  houseNumber: string | null;
  city: string | null;
  /** Ve tvaru "512 63", jak se PSČ v Česku píše. */
  zip: string | null;
  lat: number | null;
  lng: number | null;
}

interface SuggestResponse {
  suggestions?: { text: string; magicKey: string; type: string }[];
}

interface CandidateResponse {
  candidates?: {
    address: string;
    location?: { x: number; y: number };
    attributes?: { Type?: string };
  }[];
}

/** Adresní místo bez ulice se v RÚIAN píše "č.p. 62" / "č.ev. 6" — ulice tam prostě není. */
const NO_STREET_PREFIX = /^č\.(p|ev)\.$/i;
/** Číslo popisné, volitelně s orientačním a písmenem: "3", "1142/10", "12b", "301/3a". */
const HOUSE_NUMBER = /^\d+[a-zA-Z]?(\/\d+[a-zA-Z]?)?$/;
const ZIP_AND_CITY = /^(\d{5})\s+(.+)$/;

/**
 * Rozebere `Match_addr` na jednotlivá pole formuláře. Služba je vrací jen slepené dohromady,
 * strukturované atributy (`City`, `Addr_type`) chodí prázdné — ověřeno dotazy na ostrou službu.
 *
 * Tvary, které reálně chodí:
 *   "Husova 390/3, Lány, 56802 Svitavy"   ulice, číslo, část obce, PSČ, obec
 *   "Husova 3, 34961 Kladruby"            bez části obce
 *   "5. května 1142/10, Nusle, 14000 Praha 4"  ulice s číslicí a tečkou v názvu
 *   "č.p. 6, 51263 Ktová"                 obec bez uličního systému
 */
export function parseMatchAddr(matchAddr: string): Omit<RuianAddress, "lat" | "lng"> {
  const parts = matchAddr.split(",").map((p) => p.trim()).filter(Boolean);
  const label = matchAddr.trim();
  if (parts.length === 0) return { label, street: null, houseNumber: null, city: null, zip: null };

  // Poslední část je vždy "PSČ obec"; část obce mezi tím (Lány, Nusle…) nemá u nás své pole.
  const last = parts[parts.length - 1];
  const zipCity = ZIP_AND_CITY.exec(last);
  const zip = zipCity ? `${zipCity[1].slice(0, 3)} ${zipCity[1].slice(3)}` : null;
  const city = zipCity ? zipCity[2] : last;

  const tokens = parts[0].split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  const hasNumber = tokens.length > 1 && HOUSE_NUMBER.test(lastToken);
  const houseNumber = hasNumber ? lastToken : null;
  const streetTokens = hasNumber ? tokens.slice(0, -1) : tokens;
  const street =
    streetTokens.length === 1 && NO_STREET_PREFIX.test(streetTokens[0])
      ? null
      : (streetTokens.join(" ") || null);

  return { label, street, houseNumber, city, zip };
}

/** Našeptávání podle rozepsaného textu — "Husova 31 Liberec". Vrací jen položky daného druhu. */
export async function suggestRuian(text: string, limit = 8): Promise<RuianSuggestion[]> {
  const url = new URL(`${GEOCODE_BASE}/suggest`);
  url.searchParams.set("text", text);
  // O něco víc, než kolik ukážeme — odpověď mísí adresy s obcemi a ulicemi a ty odfiltrujeme.
  url.searchParams.set("maxSuggestions", String(limit * 3));
  url.searchParams.set("f", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ČÚZK vrátilo chybu (${res.status}).`);
  const data = (await res.json()) as SuggestResponse;
  return (data.suggestions ?? [])
    .filter((s) => s.type === ADDRESS_TYPE)
    .slice(0, limit)
    .map((s) => ({ text: s.text, magicKey: s.magicKey }));
}

/** Dotažení vybrané položky včetně souřadnic. `magicKey` pochází ze `suggestRuian`. */
export async function resolveRuian(text: string, magicKey: string): Promise<RuianAddress | null> {
  const url = new URL(`${GEOCODE_BASE}/findAddressCandidates`);
  url.searchParams.set("SingleLine", text);
  url.searchParams.set("magicKey", magicKey);
  // Služba počítá v S-JTSK (5514); mapa projektu i pole gps_lat/gps_lng jedou ve WGS84.
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ČÚZK vrátilo chybu (${res.status}).`);
  const data = (await res.json()) as CandidateResponse;
  const candidate = (data.candidates ?? []).find((c) => c.attributes?.Type === ADDRESS_TYPE) ?? data.candidates?.[0];
  if (!candidate) return null;

  return {
    ...parseMatchAddr(candidate.address),
    lat: candidate.location ? candidate.location.y : null,
    lng: candidate.location ? candidate.location.x : null,
  };
}
