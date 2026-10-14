// Parcely z RÚIAN přes mapovou službu ČÚZK — veřejné ArcGIS REST API, bez klíče.
// Zdroj pravdy pro tvar odpovědi a číselníky:
// https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/5 (Parcela)
// https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/7 (KatastralniUzemi)
//
// Vědomě to NEJDE přes geokodér (GeocodeSOE) jako adresy: ten sice parcely zná, ale najde je
// jen na přesný tvar "Turnov 1247/3" a neřekne druh číslování. Tahle vrstva vrací i
// `druhcislovanikod` (1 = stavební, 2 = pozemková) a výměru, což je přesně to, co panel parcel
// potřebuje — v jednom katastrálním území může stejné číslo existovat obojího druhu.
const MAP_SERVICE = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer";
const PARCEL_LAYER = 5;
const CADASTRE_LAYER = 7;
const REQUEST_TIMEOUT_MS = 6000;
/** Kolik katastrálních území se vezme, když název sedí na víc z nich ("Dolánky…"). */
const MAX_CADASTRES = 10;

export type ParcelKind = "stavebni" | "pozemkova";

const KIND_BY_CODE: Record<number, ParcelKind> = { 1: "stavebni", 2: "pozemkova" };

export interface ParcelMatch {
  cisloParcely: string;
  druh: ParcelKind;
  /** Výměra v m² tak, jak ji vede katastr. */
  vymeraM2: number | null;
  katastralniUzemi: string;
}

/** Parcelní číslo je vždy "kmenové" nebo "kmenové/poddělení" — nic jiného do dotazu nepustíme. */
export const PARCEL_QUERY_PATTERN = /^\d{1,6}(\/\d{0,4})?$/;
/** Název katastrálního území: písmena, číslice, mezery a spojovníky/tečky (např. "Liberec I-Staré Město"). */
const CADASTRE_NAME_PATTERN = /^[\p{L}\d\s.\-/]{2,48}$/u;

interface QueryResponse<T> {
  features?: { attributes: T }[];
  error?: { message?: string };
}

/** Escapování do SQL literálu ArcGIS `where`. Vstupy navíc procházejí whitelistem výš. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function queryLayer<T>(layer: number, where: string, outFields: string, params: Record<string, string> = {}) {
  const url = new URL(`${MAP_SERVICE}/${layer}/query`);
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ČÚZK vrátilo chybu (${res.status}).`);
  const data = (await res.json()) as QueryResponse<T>;
  // Služba umí vrátit HTTP 200 s chybou uvnitř těla (např. špatný `where`).
  if (data.error) throw new Error(data.error.message ?? "ČÚZK dotaz odmítlo.");
  return (data.features ?? []).map((f) => f.attributes);
}

interface CadastreRow {
  kod: number;
  nazev: string;
}

/**
 * Katastrální území podle názvu. Přesná shoda má přednost — jinak by "Turnov" táhl i
 * "Bukovina u Turnova" a parcelní čísla by se míchala přes půl okresu.
 */
export async function findCadastres(name: string): Promise<CadastreRow[]> {
  const trimmed = name.trim();
  if (!CADASTRE_NAME_PATTERN.test(trimmed)) return [];

  const exact = await queryLayer<CadastreRow>(CADASTRE_LAYER, `nazev = ${sqlLiteral(trimmed)}`, "kod,nazev");
  if (exact.length > 0) return exact;

  return queryLayer<CadastreRow>(CADASTRE_LAYER, `nazev LIKE ${sqlLiteral(`${trimmed}%`)}`, "kod,nazev", {
    resultRecordCount: String(MAX_CADASTRES),
    orderByFields: "nazev",
  });
}

interface ParcelRow {
  cisloparcely: string;
  druhcislovanikod: number;
  vymeraparcely: number | null;
  katastralniuzemi: number;
}

/**
 * Parcely v daném katastrálním území, jejichž číslo začíná zadaným řetězcem. Bez katastrálního
 * území se nehledá — samotné "1247" existuje v tisících území a nabídka by nedávala smysl.
 */
export async function searchParcels(
  katastralniUzemi: string,
  cisloParcely: string,
  limit = 8,
): Promise<ParcelMatch[]> {
  const query = cisloParcely.trim();
  if (!PARCEL_QUERY_PATTERN.test(query)) return [];

  const cadastres = await findCadastres(katastralniUzemi);
  if (cadastres.length === 0) return [];
  const nameByCode = new Map(cadastres.map((c) => [c.kod, c.nazev]));

  const rows = await queryLayer<ParcelRow>(
    PARCEL_LAYER,
    `katastralniuzemi IN (${cadastres.map((c) => c.kod).join(",")}) AND cisloparcely LIKE ${sqlLiteral(`${query}%`)}`,
    "cisloparcely,druhcislovanikod,vymeraparcely,katastralniuzemi",
    { resultRecordCount: String(limit), orderByFields: "kmenovecislo,poddelenicisla" },
  );

  return rows
    .filter((r) => KIND_BY_CODE[r.druhcislovanikod] !== undefined)
    .map((r) => ({
      cisloParcely: r.cisloparcely,
      druh: KIND_BY_CODE[r.druhcislovanikod],
      vymeraM2: r.vymeraparcely ?? null,
      katastralniUzemi: nameByCode.get(r.katastralniuzemi) ?? katastralniUzemi.trim(),
    }));
}
