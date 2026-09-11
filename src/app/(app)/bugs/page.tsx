import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Bug/Entity.json";
import viewTemplate from "@/solutions/Projektant_CRM/Entities/Bug/SavedQueries/active_bugs.json";
import myView from "@/solutions/Projektant_CRM/Entities/Bug/SavedQueries/my_bugs.json";

export default async function BugsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[...buildStatusViews(entity as EntityDefinition, viewTemplate as ViewTemplate), myView as ViewDefinition]}
      select="id, name, status, created_at, status_reason:option_set_values!bugs_status_reason_id_fkey(label), owner:users!bugs_owner_id_fkey(first_name, last_name, email)"
      basePath="/bugs"
      newLabel="Nahlásit chybu"
      description="Sem nahlaste chyby nalezené při testování — jméno, popis problému a klidně i screenshot."
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
