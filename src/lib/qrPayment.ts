import QRCode from "qrcode";

// QR Platba (SPAYD) — formát ověřený proti oficiální specifikaci na qr-platba.cz. Řetězec jde
// do QR kódu na faktuře, banking appky ho po naskenování přečtou a předvyplní platbu.

export interface SpaydFields {
  iban: string;
  /** Částka v CZK, max 2 desetinná místa. */
  amount: number;
  /** Variabilní symbol — nečíselné znaky se odfiltrují, ořízne na 10 znaků (limit specifikace). */
  variableSymbol?: string | null;
  /** ISO datum (YYYY-MM-DD) — do SPAYD jde jako YYYYMMDD. */
  /** Zpráva pro příjemce, max 60 znaků — diakritika se odstraní kvůli kompatibilitě se staršími bankovními appkami. */
  message?: string | null;
}

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Ořízne na bezpečnou znakovou sadu ze specifikace (číslice, velká písmena, mezera, $ % * + - . / :). */
function sanitizeMessage(message: string): string {
  return stripDiacritics(message)
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, "")
    .slice(0, 60)
    .trim();
}

/** Sestaví SPAYD řetězec — pořadí polí odpovídá běžným příkladům z oficiální specifikace.
 *
 * Datum splatnosti se do QR SCHVÁLNĚ nedává. Pole DT bankovní aplikace berou jako datum splatnosti
 * příkazu a platbu na ten den naplánují místo okamžitého odeslání — odběratel po naskenování čeká,
 * i když chce zaplatit hned. Splatnost je vytištěná na faktuře, kam patří. */
export function buildSpayd(fields: SpaydFields): string {
  const parts = ["SPD*1.0", `ACC:${fields.iban}`, `AM:${fields.amount.toFixed(2)}`, "CC:CZK"];

  const vs = fields.variableSymbol?.replace(/\D/g, "").slice(0, 10);
  if (vs) parts.push(`X-VS:${vs}`);

  const msg = fields.message ? sanitizeMessage(fields.message) : "";
  if (msg) parts.push(`MSG:${msg}`);

  return parts.join("*");
}

/** SPAYD -> QR kód jako data: URL (PNG), pro vložení do PDF (`<Image src={...}>`). */
export async function generateQrPaymentDataUrl(spayd: string): Promise<string> {
  return QRCode.toDataURL(spayd, { errorCorrectionLevel: "M", margin: 1 });
}
