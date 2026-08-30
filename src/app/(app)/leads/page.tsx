import { EntityListPage } from "@/engine/EntityListPage";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import activeView from "@/solutions/Projektant_CRM/Entities/Lead/SavedQueries/active_leads.json";
import myView from "@/solutions/Projektant_CRM/Entities/Lead/SavedQueries/my_leads.json";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[activeView, myView] as ViewDefinition[]}
      select="id, name, company_name, status, expected_value, created_at, status_reason:option_set_values!leads_status_reason_id_fkey(label), owner:users!leads_owner_id_fkey(first_name, last_name, email)"
      basePath="/leads"
      newLabel="Nový zájemce"
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatOwner(row.owner),
      })}
    />
  );
}

function formatOwner(owner: unknown) {
  const u = owner as { first_name: string | null; last_name: string | null; email: string | null } | null;
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}
