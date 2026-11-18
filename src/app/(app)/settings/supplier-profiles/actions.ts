"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SupplierProfileInput {
  nazev: string;
  jmeno: string;
  address_street: string;
  address_house_number: string;
  address_city: string;
  address_zip: string;
  ico: string;
  dic: string;
  je_platce_dph: boolean;
  bank_account: string;
  email: string;
  telefon: string;
  web: string;
  misto_vystaveni: string;
  logo_url: string | null;
  default_due_days: number;
  platnost_nabidky_mesice: number;
  vychozi_poznamky: string;
  pouzit_pro_nabidky: boolean;
  pouzit_pro_faktury: boolean;
}

const PATH = "/settings/supplier-profiles";

/** Prázdný text = null, ať se v PDF netiskne prázdný řádek. */
const orNull = (value: string) => value.trim() || null;

/**
 * Uloží profil dodavatele (bez id = nový). Běží pod identitou uživatele, organizaci hlídá RLS.
 * Chybu vrací jako hodnotu — zprávu vyhozené chyby Next.js v produkci klientovi nepředá.
 */
export async function saveSupplierProfile(id: string | null, input: SupplierProfileInput): Promise<{ error?: string }> {
  if (!input.nazev.trim() || !input.jmeno.trim()) return { error: "Vyplň název profilu a jméno dodavatele." };
  const supabase = await createClient();

  // Výchozí profil smí být jen jeden pro nabídky a jeden pro faktury — ostatním příznak nejdřív
  // sundat (unikátní index by jinak uložení odmítl).
  for (const flag of ["pouzit_pro_nabidky", "pouzit_pro_faktury"] as const) {
    if (!input[flag]) continue;
    let clear = supabase.from("supplier_profiles").update({ [flag]: false }).eq(flag, true);
    if (id) clear = clear.neq("id", id);
    const { error } = await clear;
    if (error) {
      console.error("saveSupplierProfile: clear default failed", error);
      return { error: "Profil se nepodařilo uložit." };
    }
  }

  const row = {
    nazev: input.nazev.trim(),
    jmeno: input.jmeno.trim(),
    address_street: orNull(input.address_street),
    address_house_number: orNull(input.address_house_number),
    address_city: orNull(input.address_city),
    address_zip: orNull(input.address_zip),
    ico: orNull(input.ico),
    dic: orNull(input.dic),
    je_platce_dph: input.je_platce_dph,
    bank_account: orNull(input.bank_account),
    email: orNull(input.email),
    telefon: orNull(input.telefon),
    web: orNull(input.web),
    misto_vystaveni: orNull(input.misto_vystaveni),
    logo_url: input.logo_url,
    default_due_days: Number.isFinite(input.default_due_days) ? input.default_due_days : 14,
    platnost_nabidky_mesice: Number.isFinite(input.platnost_nabidky_mesice) ? input.platnost_nabidky_mesice : 3,
    vychozi_poznamky: orNull(input.vychozi_poznamky),
    pouzit_pro_nabidky: input.pouzit_pro_nabidky,
    pouzit_pro_faktury: input.pouzit_pro_faktury,
  };

  const { error } = id
    ? await supabase.from("supplier_profiles").update(row).eq("id", id)
    : await supabase.from("supplier_profiles").insert(row);
  if (error) {
    console.error("saveSupplierProfile: save failed", error);
    return { error: "Profil se nepodařilo uložit." };
  }
  revalidatePath(PATH);
  return {};
}

export async function deleteSupplierProfile(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  // Nabídky a faktury s tímhle profilem o něj přijdou (on delete set null) a vytisknou se
  // s výchozím profilem — proto mazání jen s potvrzením v UI.
  const { error } = await supabase.from("supplier_profiles").delete().eq("id", id);
  if (error) {
    console.error("deleteSupplierProfile: failed", error);
    return { error: "Profil se nepodařilo smazat." };
  }
  revalidatePath(PATH);
  return {};
}
