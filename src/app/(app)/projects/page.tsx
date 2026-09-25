import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { formatContactName } from "@/engine/contacts";
import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import viewTemplate from "@/solutions/Projektant_CRM/Entities/Project/SavedQueries/active_projects.json";
import myView from "@/solutions/Projektant_CRM/Entities/Project/SavedQueries/my_projects.json";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[...buildStatusViews(entity as EntityDefinition, viewTemplate as ViewTemplate), myView as ViewDefinition]}
      select="id, name, deadline, status, created_at, primary_contact:contacts!projects_primary_contact_id_fkey(first_name, last_name), status_reason:option_set_values!projects_status_reason_id_fkey(label), owner:users!projects_owner_id_fkey(first_name, last_name, email)"
      basePath="/projects"
      newLabel="Nový projekt"
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        primary_contact: formatContactName(row.primary_contact as never),
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
