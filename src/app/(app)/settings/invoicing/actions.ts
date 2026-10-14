"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InvoicingSettingsInput {
  logo_url: string | null;
  ico: string;
  dic: string;
  je_platce_dph: boolean;
  default_vat_rate: number;
  address_street: string;
  address_house_number: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  bank_account: string;
  supplier_name: string;
  default_due_days: number;
  default_quote_validity_days: number;
}

/**
 * organizations nemá klientskou UPDATE policy (stejný důvod jako u Google Drive nastavení) —
 * nejdřív ověří organizaci PŘIHLÁŠENÉHO uživatele přes RLS-scoped klienta, teprve na tu
 * konkrétní řádku pustí admin klienta.
 *
 * Vrací chybu jako hodnotu: zprávu vyhozené chyby Next.js v produkci klientovi nepředá.
 */
export async function updateInvoicingSettings(input: InvoicingSettingsInput): Promise<{ error?: string }> {
  const vatRate = input.default_vat_rate;
  if (input.je_platce_dph && !(Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 100)) {
    return { error: "Výchozí sazba DPH musí být číslo od 0 do 100." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nepřihlášený uživatel." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (profileError || !profile) {
    console.error("updateInvoicingSettings: profile load failed", profileError);
    return { error: "Chybí uživatelský profil." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      logo_url: input.logo_url,
      ico: input.ico || null,
      dic: input.dic || null,
      je_platce_dph: input.je_platce_dph,
      // Neplátci se pole sazby nezobrazuje; neplatnou hodnotu tam nepřepisuje, ať po návratu
      // k plátcovství zůstane původní sazba.
      default_vat_rate: Number.isFinite(vatRate) ? vatRate : undefined,
      address_street: input.address_street || null,
      address_house_number: input.address_house_number || null,
      address_city: input.address_city || null,
      address_zip: input.address_zip || null,
      address_country: input.address_country || null,
      bank_account: input.bank_account || null,
      supplier_name: input.supplier_name || null,
      default_due_days: input.default_due_days || 14,
      default_quote_validity_days: input.default_quote_validity_days || 30,
    })
    .eq("id", profile.organization_id);
  if (error) {
    console.error("updateInvoicingSettings: update failed", error);
    return { error: "Nastavení se nepodařilo uložit." };
  }

  revalidatePath("/settings/invoicing");
  return {};
}
