/**
 * Pomocné funkce cenové nabídky po fázích — sdílí je PDF, formuláře i MCP, ať se nabídka
 * všude skládá stejně. Čisté funkce bez Supabase, kvůli testům.
 */

export interface QuotePhaseTemplateInput {
  kod: string;
  nazev: string;
  odrazky: string[];
  cena: number;
}

/**
 * Vzorové šablony fází (PAS, STU, DSP) — nabízí je Nastavení → Šablony fází jedním tlačítkem,
 * když firma žádné nemá. Každá firma si je pak upraví; do nabídky se kopírují.
 */
export const DEFAULT_PHASE_TEMPLATES: QuotePhaseTemplateInput[] = [
  {
    kod: "PAS",
    nazev: "Zaměření stávajícího stavu RD (pasport)",
    odrazky: [
      "průvodní a souhrnná technická zpráva",
      "situace širších vztahů",
      "zákres do katastrální mapy",
      "půdorysy jednotlivých podlaží",
      "řez",
      "pohledy",
    ],
    cena: 25000,
  },
  {
    kod: "STU",
    nazev: "Architektonická studie",
    odrazky: [
      "průvodní zpráva",
      "situační výkres",
      "návrh stavebních úprav a architektonické řešení domu",
      "2D půdorysy, pohledy, 3D axonometrie, řezy, vizualizace",
      "2x konzultace s klientem a úpravy návrhu (dle potřeby)",
    ],
    cena: 55000,
  },
  {
    kod: "DSP",
    nazev: "Dokumentace pro povolení stavby",
    odrazky: [
      "průvodní list a souhrnná technická zpráva",
      "situační výkresy",
      "architektonicko-stavební řešení (půdorysy, řezy, pohledy, technická zpráva)",
      "dokladová část",
      "koordinace profesí (požárně bezpečnostní řešení, PENB, statika dle potřeby)",
    ],
    cena: 0,
  },
];

const NBSP = " ";

/** Cena ve tvaru „25 000,-“ (nezlomitelná mezera jako oddělovač tisíců). Nula = „[cena]“,
 * aby nevyplněná cena v PDF nevypadala jako „zdarma“. */
export function formatPhasePrice(value: number): string {
  if (!value) return "[cena]";
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${rounded < 0 ? "-" : ""}${digits},-`;
}

/** Odrážky z textarea: jeden řádek = jedna odrážka, prázdné řádky pryč. */
export function parseLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface AddressParts {
  street?: string | null;
  houseNumber?: string | null;
  city?: string | null;
  zip?: string | null;
}

/** „Pod zelenou cestou 1759, 511 01 Turnov“. Bez ulice (malá obec) „č. p. 261, 512 06 Benešov…“. */
export function formatAddressLine(a: AddressParts): string {
  const street = [a.street, a.houseNumber].filter(Boolean).join(" ");
  const streetPart = street ? (a.street ? street : `č. p. ${a.houseNumber}`) : "";
  const cityPart = [a.zip, a.city].filter(Boolean).join(" ");
  return [streetPart, cityPart].filter(Boolean).join(", ");
}

/** Řádek „Zadavatel“: jméno (nebo firma) a adresa jedním řádkem. */
export function formatClientLine(name: string | null | undefined, address: AddressParts): string {
  return [name?.trim(), formatAddressLine(address)].filter(Boolean).join(", ");
}

/** Platnost nabídky: dnešek + N měsíců (YYYY-MM-DD). */
export function addMonths(months: number, from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 30. 11. + 3 měsíce nesmí přeskočit na 2. 3. — zůstat na posledním dni měsíce.
  if (d.getDate() < day) d.setDate(0);
  // Místní datum, ne toISOString — to by kolem půlnoci v ČR vrátilo předchozí den (UTC).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Název PDF jako ve vzoru: „Cenová nabídka_PAS+STU_Bušanovský“. */
export function quoteFileName(phaseCodes: (string | null)[], clientName: string | null | undefined, number: string) {
  const codes = phaseCodes.filter(Boolean).join("+");
  const surname = (clientName ?? "").split(",")[0].trim().split(/\s+/).pop() ?? "";
  const parts = ["Cenová nabídka", codes, surname].filter(Boolean);
  return parts.length > 1 ? parts.join("_") : `Cenová nabídka_${number}`;
}
