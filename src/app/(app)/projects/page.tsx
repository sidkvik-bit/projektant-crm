import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import activeView from "@/solutions/Projektant_CRM/Entities/Project/SavedQueries/active_projects.json";
import myView from "@/solutions/Projektant_CRM/Entities/Project/SavedQueries/my_projects.json";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[activeView, myView] as ViewDefinition[]}
      select="id, name, deadline, status, created_at, account:accounts(name), status_reason:option_set_values!projects_status_reason_id_fkey(label), owner:users!projects_owner_id_fkey(first_name, last_name, email)"
      basePath="/projects"
      newLabel="Nový projekt"
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        account: (row.account as unknown as { name: string } | null)?.name ?? null,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
