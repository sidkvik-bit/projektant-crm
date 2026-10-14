import type { SupabaseClient } from "@supabase/supabase-js";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";

/** Lidský popisek pro Activity.entity_type (logický název entity, viz registry.ts). */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Lead: "Zájemce",
  Account: "Firma",
  Contact: "Kontakt",
  Project: "Projekt",
};

export interface TimelineActivity {
  id: string;
  subject: string;
  description: string | null;
  activity_date: string;
  activity_type: string | null;
}

interface ActivityRow {
  id: string;
  subject: string;
  description: string | null;
  activity_date: string;
  activity_type: { label: string } | null;
}

export interface EntityRef {
  entityType: string;
  entityId: string;
}

/**
 * Aktivity napojené na záznam (entity_type/entity_id) — pro ActivityTimeline.
 * `related` umožní rollup: aktivity navázaných záznamů (např. u Firmy i aktivity
 * jejích Kontaktů a Projektů) se ukážou spolu s vlastními, D365-style.
 */
export async function getTimelineActivities(
  supabase: SupabaseClient,
  primary: EntityRef,
  related: EntityRef[] = [],
): Promise<TimelineActivity[]> {
  const refs = [primary, ...related];
  const orFilter = refs
    .map((r) => `and(entity_type.eq.${r.entityType},entity_id.eq.${r.entityId})`)
    .join(",");

  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, subject, description, activity_date, activity_type:option_set_values!activities_activity_type_id_fkey(label)",
    )
    .or(orFilter)
    .order("activity_date", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as ActivityRow[]).map((a) => ({
    id: a.id,
    subject: a.subject,
    description: a.description,
    activity_date: a.activity_date,
    activity_type: a.activity_type?.label ?? null,
  }));
}

/**
 * Dořeší "Vztahuje se k" (entity_type/entity_id) na skutečný název navázaného
 * záznamu + odkaz na jeho detail — polymorfní vazba nejde vyřešit jedním
 * Postgrest joinem, takže se seskupí podle entity_type a doptá dávkově.
 * Použij jako `resolveRows` v EntityListPage (grid) nebo přímo pro formulář.
 */
export async function resolveActivityRegarding<T extends { entity_type: string; entity_id: string }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<(T & { regarding: string; regarding_href: string | null })[]> {
  const entityTypes = Array.from(new Set(rows.map((r) => r.entity_type)));
  const labelMaps = Object.fromEntries(
    await Promise.all(
      entityTypes.map(async (entityType) => {
        const reg = entityRegistry[entityType];
        const ids = Array.from(new Set(rows.filter((r) => r.entity_type === entityType).map((r) => r.entity_id)));
        if (!reg || ids.length === 0) return [entityType, new Map<string, string>()] as const;
        const { data } = await supabase.from(reg.table).select(`id, ${reg.labelFields.join(", ")}`).in("id", ids);
        const map = new Map<string, string>(
          ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [
            r.id as string,
            reg.labelFields.map((f) => r[f]).filter(Boolean).join(" ") || "—",
          ]),
        );
        return [entityType, map] as const;
      }),
    ),
  );

  return rows.map((row) => {
    const reg = entityRegistry[row.entity_type];
    const label = (labelMaps[row.entity_type] as Map<string, string> | undefined)?.get(row.entity_id) ?? "—";
    return {
      ...row,
      regarding: label,
      regarding_href: reg?.basePath ? `${reg.basePath}/${row.entity_id}` : null,
    };
  });
}
