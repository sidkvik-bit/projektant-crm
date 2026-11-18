import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { SUPPLIER_PROFILE_COLUMNS, type SupplierProfile } from "@/lib/supplierProfiles";
import { SupplierProfilesClient } from "./SupplierProfilesClient";

export default async function SupplierProfilesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_profiles")
    .select(SUPPLIER_PROFILE_COLUMNS)
    .order("created_at");
  if (error) throw error;

  return (
    <div>
      <PageHeader
        title="Profily dodavatele"
        description="Kdo vystavuje nabídky a faktury — jméno, adresa, IČO, účet, logo a texty. U každé nabídky a faktury jde profil vybrat; výchozí se předvyplní."
      />
      <div className="max-w-4xl p-6">
        <SupplierProfilesClient profiles={(data ?? []) as unknown as SupplierProfile[]} />
      </div>
    </div>
  );
}
