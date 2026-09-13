import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/currentUser";
import { PageHeader } from "@/components/shell/PageHeader";
import { AdminOrganizationList, type AdminOrganizationRow } from "./AdminOrganizationList";
import { adminSwitchOrganization } from "../actions";

/** Cross-org přehled jde přes admin klienta (service_role) — RLS ostatních tabulek je striktně
 * per-organizace, takže spočítat členy/záznamy CIZÍ organizace přes běžného klienta nejde.
 * Přístup je ověřený v ../layout.tsx a znovu v samotné RPC funkci při přepnutí. */
export default async function AdminOrganizationsPage() {
  const context = await getCurrentUserContext();
  const admin = createAdminClient();

  const [orgsRes, usersRes, accountsRes, projectsRes] = await Promise.all([
    admin.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false }),
    admin.from("users").select("organization_id, role"),
    admin.from("accounts").select("organization_id"),
    admin.from("projects").select("organization_id"),
  ]);

  const countBy = (rows: { organization_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
    return counts;
  };

  const userCounts = countBy(usersRes.data as { organization_id: string }[] | null);
  const accountCounts = countBy(accountsRes.data as { organization_id: string }[] | null);
  const projectCounts = countBy(projectsRes.data as { organization_id: string }[] | null);

  const organizations: AdminOrganizationRow[] = (
    (orgsRes.data ?? []) as { id: string; name: string; status: string; created_at: string }[]
  ).map((org) => ({
    id: org.id,
    name: org.name,
    status: org.status,
    createdAt: org.created_at,
    userCount: userCounts.get(org.id) ?? 0,
    accountCount: accountCounts.get(org.id) ?? 0,
    projectCount: projectCounts.get(org.id) ?? 0,
    isCurrent: org.id === context?.organizationId,
  }));

  return (
    <div>
      <PageHeader
        title="Organizace"
        description={`Všechny organizace v systému (${organizations.length}). Přepnutím se do organizace uvidíš appku jejíma očima.`}
      />
      <div className="p-6">
        <AdminOrganizationList organizations={organizations} action={adminSwitchOrganization} />
      </div>
    </div>
  );
}
