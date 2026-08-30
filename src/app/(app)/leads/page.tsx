import { EntityListPage } from "@/engine/EntityListPage";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import view from "@/solutions/Projektant_CRM/Entities/Lead/SavedQueries/active_leads.json";

export default async function LeadsPage() {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      view={view as ViewDefinition}
      select="id, name, company_name, status, expected_value, created_at, status_reason:option_set_values!leads_status_reason_id_fkey(label), owner:users!leads_owner_id_fkey(first_name, last_name, email)"
      basePath="/leads"
      newLabel="Nový zájemce"
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
