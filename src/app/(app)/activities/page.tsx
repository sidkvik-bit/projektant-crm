import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Activity/Entity.json";
import view from "@/solutions/Projektant_CRM/Entities/Activity/SavedQueries/active_activities.json";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Lead: "Zájemce",
  Account: "Obchodní vztah",
  Contact: "Kontakt",
  Project: "Projekt",
};

export default async function ActivitiesPage() {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      view={view as ViewDefinition}
      select="id, subject, entity_type, activity_date, activity_type:option_set_values!activities_activity_type_id_fkey(label), owner:users!activities_owner_id_fkey(first_name, last_name, email)"
      basePath="/activities"
      description="Aktivity se zakládají z detailu příslušného záznamu (např. projektu)."
      mapRow={(row) => ({
        ...row,
        activity_type: (row.activity_type as unknown as { label: string } | null)?.label ?? null,
        entity_type: ENTITY_TYPE_LABELS[row.entity_type as string] ?? row.entity_type,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
