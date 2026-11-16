import type { SupabaseClient } from "@supabase/supabase-js";
import { foldCustomValues, unfoldCustomValues } from "@/customization/customValues";
import { recordPlugins } from "@/customization/plugins";

// Generická data-access vrstva nad Supabase. Multi-tenant izolace (organization_id)
// řeší výhradně RLS na straně DB — tahle vrstva o organizaci nic neví.
//
// Je to zároveň jediné místo, kudy jdou zápisy záznamů, takže tady se zapojuje vrstva úprav
// firmy: vlastní pole (new_…) se převádí do/z jsonb sloupce `custom` a kolem insertu/updatu/
// deletu běží pluginy firmy (src/customization/plugins.ts).

export interface ListOptions {
  select?: string;
  filter?: Record<string, string | number | boolean | null>;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
}

export async function listRecords<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  options: ListOptions = {},
): Promise<T[]> {
  let query = supabase.from(table).select(options.select ?? "*");

  if (options.filter) {
    for (const [column, value] of Object.entries(options.filter)) {
      query = query.eq(column, value);
    }
  }
  if (options.sort) {
    query = query.order(options.sort.field, {
      ascending: options.sort.direction === "asc",
    });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(unfoldCustomValues) as T[];
}

export async function getRecordById<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  select = "*",
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("id", id)
    .single();
  if (error) throw error;
  return unfoldCustomValues(data as unknown as Record<string, unknown>) as T;
}

export async function createRecord<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<T> {
  const plugins = await recordPlugins(supabase, table, values);
  const before = plugins ? await plugins.run("beforeCreate", { record: values }) : null;

  const { data, error } = await supabase
    .from(table)
    .insert(foldCustomValues({ ...values, ...before?.changes }))
    .select()
    .single();
  if (error) throw error;
  const record = unfoldCustomValues(data as Record<string, unknown>);

  if (plugins) await plugins.run("afterCreate", { record, recordId: record.id as string });
  return record as T;
}

export async function updateRecord<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<T> {
  const plugins = await recordPlugins(supabase, table, values.entity_name ? values : await entityNameOf(supabase, table, id));
  const existing = plugins ? await getRecordById<Record<string, unknown>>(supabase, table, id) : null;
  const before = plugins
    ? await plugins.run("beforeUpdate", { record: { ...existing, ...values }, before: existing, recordId: id })
    : null;

  const { data, error } = await supabase
    .from(table)
    .update(foldCustomValues({ ...values, ...before?.changes }))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  const record = unfoldCustomValues(data as Record<string, unknown>);

  if (plugins) await plugins.run("afterUpdate", { record, before: existing, recordId: id });
  return record as T;
}

export async function deleteRecord(
  supabase: SupabaseClient,
  table: string,
  id: string,
): Promise<void> {
  const plugins = await recordPlugins(supabase, table, await entityNameOf(supabase, table, id));
  const existing = plugins ? await getRecordById<Record<string, unknown>>(supabase, table, id) : null;
  if (plugins) await plugins.run("beforeDelete", { record: existing, before: existing, recordId: id });

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;

  if (plugins) await plugins.run("afterDelete", { record: null, before: existing, recordId: id });
}

/** Vlastní entity sdílí tabulku custom_records — u nich se entita pozná až z řádku. */
async function entityNameOf(supabase: SupabaseClient, table: string, id: string) {
  if (table !== "custom_records") return undefined;
  const { data } = await supabase.from(table).select("entity_name").eq("id", id).maybeSingle();
  return (data ?? undefined) as Record<string, unknown> | undefined;
}
