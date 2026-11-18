import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAddressLine } from "./quoteDocument";

export interface SupplierProfile {
  id: string;
  nazev: string;
  jmeno: string;
  address_street: string | null;
  address_house_number: string | null;
  address_city: string | null;
  address_zip: string | null;
  ico: string | null;
  dic: string | null;
  je_platce_dph: boolean;
  bank_account: string | null;
  email: string | null;
  telefon: string | null;
  web: string | null;
  misto_vystaveni: string | null;
  logo_url: string | null;
  default_due_days: number;
  platnost_nabidky_mesice: number;
  vychozi_poznamky: string | null;
  pouzit_pro_nabidky: boolean;
  pouzit_pro_faktury: boolean;
}

export const SUPPLIER_PROFILE_COLUMNS =
  "id, nazev, jmeno, address_street, address_house_number, address_city, address_zip, ico, dic, je_platce_dph, bank_account, email, telefon, web, misto_vystaveni, logo_url, default_due_days, platnost_nabidky_mesice, vychozi_poznamky, pouzit_pro_nabidky, pouzit_pro_faktury";

export type DocumentKind = "quote" | "invoice";

/**
 * Profil dodavatele pro doklad: ten vybraný na dokladu, jinak výchozí pro daný druh dokladu
 * (Nastavení → Profily dodavatele). `null` = firma profily nepoužívá, volající sáhne po
 * údajích z Nastavení → Fakturace (organizations), jako dřív.
 */
export async function resolveSupplierProfile(
  supabase: SupabaseClient,
  kind: DocumentKind,
  profileId: string | null | undefined,
): Promise<SupplierProfile | null> {
  if (profileId) {
    const { data, error } = await supabase
      .from("supplier_profiles")
      .select(SUPPLIER_PROFILE_COLUMNS)
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as unknown as SupplierProfile;
  }
  const { data, error } = await supabase
    .from("supplier_profiles")
    .select(SUPPLIER_PROFILE_COLUMNS)
    .eq(kind === "quote" ? "pouzit_pro_nabidky" : "pouzit_pro_faktury", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SupplierProfile | null) ?? null;
}

export function supplierAddress(p: Pick<SupplierProfile, "address_street" | "address_house_number" | "address_city" | "address_zip">) {
  return formatAddressLine({
    street: p.address_street,
    houseNumber: p.address_house_number,
    city: p.address_city,
    zip: p.address_zip,
  });
}
