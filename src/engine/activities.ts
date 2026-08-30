import type { SupabaseClient } from "@supabase/supabase-js";

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
