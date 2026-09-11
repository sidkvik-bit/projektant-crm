// České číslo účtu -> IBAN (mod-97, ISO 7064) — potřeba pro QR Platbu (SPAYD ACC pole musí
// být IBAN, ne tuzemský tvar). Algoritmus i testovací vektor ověřené proti dvěma nezávislým
// zdrojům (csas.cz IBAN kalkulačka, kodbank.cz): 19-2000145399/0800 -> CZ6508000000192000145399.

const ACCOUNT_RE = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/;

function mod97(digits: string): number {
  let remainder = 0;
  for (const ch of digits) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}

/** Písmena země na čísla dle IBAN (A=10 ... Z=35) — "CZ" -> "1235". */
function letterToDigits(letters: string): string {
  return [...letters].map((ch) => (ch.charCodeAt(0) - 55).toString()).join("");
}

/**
 * Převede české číslo účtu (`[předčíslí-]číslo/kód banky`) na IBAN. `null` pro neplatný vstup —
 * volající (PDF generování) pak QR kód prostě vynechá, nic neshazuje.
 */
export function accountToIban(account: string): string | null {
  const match = ACCOUNT_RE.exec(account.trim());
  if (!match) return null;

  const [, prefix = "", number, bankCode] = match;
  const bban = bankCode + prefix.padStart(6, "0") + number.padStart(10, "0");

  // Kontrolní číslice: BBAN + kód země jako čísla + "00", mod 97, 98 - zbytek, na 2 místa.
  const forCheckDigits = bban + letterToDigits("CZ") + "00";
  const checkDigits = String(98 - mod97(forCheckDigits)).padStart(2, "0");

  return `CZ${checkDigits}${bban}`;
}
