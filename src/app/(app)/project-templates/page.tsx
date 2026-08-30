import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/Entity.json";
import activeView from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/SavedQueries/active_project_templates.json";
import myView from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/SavedQueries/my_project_templates.json";

export default async function ProjectTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[activeView, myView] as ViewDefinition[]}
      select="id, name, status, created_at, status_reason:option_set_values!project_templates_status_reason_id_fkey(label), owner:users!project_templates_owner_id_fkey(first_name, last_name, email)"
      basePath="/project-templates"
      newLabel="Nová šablona"
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
