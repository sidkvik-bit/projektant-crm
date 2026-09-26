import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { InvoicingSettingsForm } from "./InvoicingSettingsForm";

export default async function InvoicingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select(
      "organizations(logo_url, ico, dic, address_street, address_house_number, address_city, address_zip, address_country, bank_account, supplier_name, default_due_days, default_quote_validity_days)",
    )
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const org = profile?.organizations as unknown as {
    logo_url: string | null;
    ico: string | null;
    dic: string | null;
    address_street: string | null;
    address_house_number: string | null;
    address_city: string | null;
    address_zip: string | null;
    address_country: string | null;
    bank_account: string | null;
    supplier_name: string | null;
    default_due_days: number;
    default_quote_validity_days: number;
  } | null;

  return (
    <div>
      <PageHeader
        title="Fakturace"
        description="Fakturační údaje firmy a bankovní účet — tisknou se na PDF faktur, včetně QR Platby."
      />
      <div className="p-6">
        <InvoicingSettingsForm initial={org} />
      </div>
    </div>
  );
}
