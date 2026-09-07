"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InvoicingSettingsInput {
  logo_url: string | null;
  ico: string;
  dic: string;
  address_street: string;
  address_house_number: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  bank_account: string;
  invoice_number_prefix: string;
  default_due_days: number;
}

/**
 * organizations nemá klientskou UPDATE policy (stejný důvod jako u Google Drive nastavení) —
 * nejdřív ověří organizaci PŘIHLÁŠENÉHO uživatele přes RLS-scoped klienta, teprve na tu
 * konkrétní řádku pustí admin klienta.
 */
export async function updateInvoicingSettings(input: InvoicingSettingsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new Error("Chybí uživatelský profil.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      logo_url: input.logo_url,
      ico: input.ico || null,
      dic: input.dic || null,
      address_street: input.address_street || null,
      address_house_number: input.address_house_number || null,
      address_city: input.address_city || null,
      address_zip: input.address_zip || null,
      address_country: input.address_country || null,
      bank_account: input.bank_account || null,
      invoice_number_prefix: input.invoice_number_prefix || "FAK",
      default_due_days: input.default_due_days || 14,
    })
    .eq("id", profile.organization_id);
  if (error) throw error;

  revalidatePath("/settings/invoicing");
}
