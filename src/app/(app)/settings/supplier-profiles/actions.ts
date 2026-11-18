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
  };

  // Údaje uložit bez příznaků „výchozí“ a ty pak nastavit jednou funkcí v transakci — sundat je
  // ostatním a dát tomuhle musí proběhnout naráz (unikátní index, žádná firma bez výchozího).
  const saved = id
    ? await supabase.from("supplier_profiles").update(row).eq("id", id).select("id").single()
    : await supabase.from("supplier_profiles").insert(row).select("id").single();
  if (saved.error || !saved.data) {
    console.error("saveSupplierProfile: save failed", saved.error);
    return { error: "Profil se nepodařilo uložit." };
  }
  const { error } = await supabase.rpc("set_supplier_profile_defaults", {
    p_profile_id: saved.data.id,
    p_quotes: input.pouzit_pro_nabidky,
    p_invoices: input.pouzit_pro_faktury,
  });
  if (error) {
    console.error("saveSupplierProfile: defaults failed", error);
    return { error: "Údaje se uložily, ale výchozí profil se nepodařilo nastavit. Zkus to znovu." };
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
