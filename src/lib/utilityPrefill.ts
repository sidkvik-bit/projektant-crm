// "Předvyplnit formulář" na detailu projektu — žádný z portálů níž nejde reálně předvyplnit
// přes URL (login, GIS wizard, CAPTCHA — ověřeno ručně před stavbou tohohle), takže tlačítko
// portál jen otevře v nové záložce a vedle nabídne souhrn údajů z CRM ke zkopírování.

export interface UtilityProvider {
  key: string;
  label: string;
  url: string;
}

export const UTILITY_PROVIDERS: UtilityProvider[] = [
  { key: "cez", label: "ČEZ Distribuce", url: "https://geoportal.cezdistribuce.cz/geoportal.ses/" },
  { key: "egd", label: "EG.D (E.ON)", url: "https://www.egd.cz/zadost/vyjadreni-k-existenci-elektrickych-siti" },
  { key: "predistribuce", label: "PREdistribuce", url: "https://www.predistribuce.cz" },
  {
    key: "gasnet",
    label: "GasNet",
    url: "https://www.gasnet.cz/dalsi-sluzby/pro-stavare-a-projektanty/stanovisko-k-existenci-site",
  },
  { key: "gasd", label: "GasD", url: "https://www.gasd.cz/zadost/sdeleni-k-existenci-plynovych-siti" },
  { key: "net4gas", label: "NET4GAS", url: "https://www.net4gas.cz/cz/prepravni-soustava/zadost-vyjadreni/" },
  { key: "ppd", label: "Pražská plynárenská Distribuce", url: "https://www.ppdistribuce.cz/sluzby/eportal" },
  { key: "cetin", label: "CETIN", url: "https://www.cetin.cz/sit-cetin/vyjadrovani-o-existenci-siti" },
  { key: "mawis", label: "MAWIS UtilityReport", url: "https://mawis.eu/utilityreport" },
];

export interface PrefillData {
  applicantName: string;
  applicantIco: string | null;
  applicantLegalForm: string | null;
  applicantAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  locationAddress: string | null;
  gps: { lat: number; lng: number } | null;
  katastralniUzemi: string | null;
  parcelniCislo: string | null;
}

const FALLBACK = "—";

export interface PrefillField {
  label: string;
  value: string;
  /** Prázdné/chybějící hodnoty (FALLBACK "—") nejde smysluplně zkopírovat do formuláře. */
  copyable: boolean;
}

/** Jednotlivá pole k vyplnění do formuláře síťaře — každé zvlášť kliknutím zkopírovatelné,
 * bez nutnosti nejdřív označovat text v souhrnu. */
export function buildPrefillFields(data: PrefillData): PrefillField[] {
  const gpsLine = data.gps ? `${data.gps.lat.toFixed(6)}, ${data.gps.lng.toFixed(6)}` : null;

  const raw: [string, string | null][] = [
    ["Žadatel", data.applicantName],
    ["IČO", data.applicantIco],
    ["Právní forma", data.applicantLegalForm],
    ["Sídlo", data.applicantAddress],
    ["Kontaktní osoba", data.contactName],
    ["Telefon", data.contactPhone],
    ["E-mail", data.contactEmail],
    ["Adresa místa zájmu", data.locationAddress],
    ["GPS", gpsLine],
    ["Katastrální území", data.katastralniUzemi],
    ["Parcelní číslo", data.parcelniCislo],
  ];

  return raw.map(([label, value]) => ({ label, value: value ?? FALLBACK, copyable: value != null && value !== "" }));
}

/** Prostý text ke zkopírování najednou — jedno pole na řádek. */
export function buildPrefillSummary(data: PrefillData): string {
  return buildPrefillFields(data)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}
