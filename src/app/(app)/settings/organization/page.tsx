import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { SwitchOrganizationList } from "./SwitchOrganizationList";
import { CreateOrganizationForm } from "./CreateOrganizationForm";
import { switchOrganization, createAndSwitchOrganization } from "./actions";

export default async function OrganizationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("organizations(name)")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const currentOrgName = (profile?.organizations as unknown as { name: string } | null)?.name ?? "—";

  // RLS (organization_invites_select_own_email) vrátí pozvánky napříč VŠEMI firmami,
  // adresované mému ověřenému e-mailu — bez ohledu na to, ve které firmě jsem teď.
  const { data: invites } = await supabase
    .from("organization_invites")
    .select("organization_id, organizations(id, name)");

  const invitedOrgs = (invites ?? [])
    .map((invite) => invite.organizations as unknown as { id: string; name: string } | null)
    .filter((org): org is { id: string; name: string } => org !== null);

  return (
    <div>
      <PageHeader title="Přepnout firmu" description={`Momentálně pracuješ ve firmě "${currentOrgName}".`} />
      <div className="mx-auto max-w-sm space-y-8 p-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Čekající pozvánky</h2>
          {invitedOrgs.length > 0 ? (
            <SwitchOrganizationList
              organizations={invitedOrgs}
              currentOrgName={currentOrgName}
              action={switchOrganization}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Zatím žádné — někdo tě musí nejdřív pozvat (v jeho Nastavení → Tým).
            </p>
          )}
        </div>

        <div className="space-y-3 border-t pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Nebo založ novou firmu</h2>
          <CreateOrganizationForm currentOrgName={currentOrgName} action={createAndSwitchOrganization} />
        </div>
      </div>
    </div>
  );
}
