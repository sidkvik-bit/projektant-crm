import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { resolveActivityRegarding, ENTITY_TYPE_LABELS } from "@/engine/activities";
import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Activity/Entity.json";
import viewTemplate from "@/solutions/Projektant_CRM/Entities/Activity/SavedQueries/active_activities.json";
import myView from "@/solutions/Projektant_CRM/Entities/Activity/SavedQueries/my_activities.json";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[...buildStatusViews(entity as EntityDefinition, viewTemplate as ViewTemplate), myView as ViewDefinition]}
      select="id, subject, entity_type, entity_id, activity_date, activity_type:option_set_values!activities_activity_type_id_fkey(label), owner:users!activities_owner_id_fkey(first_name, last_name, email)"
      basePath="/activities"
      description="Aktivity se zakládají z detailu příslušného záznamu (např. projektu)."
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        activity_type: (row.activity_type as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
      resolveRows={async (supabase, rows) => {
        // resolveActivityRegarding potřebuje entity_type v syrové podobě ("Lead", ne "Zájemce") —
        // proto se lidský popisek dosazuje až tady, po vyřešení "regarding".
        const resolved = await resolveActivityRegarding(
          supabase,
          rows as unknown as { entity_type: string; entity_id: string }[],
        );
        return resolved.map((row) => ({
          ...row,
          entity_type: ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type,
        }));
      }}
    />
  );
}
