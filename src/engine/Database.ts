import type { SupabaseClient } from "@supabase/supabase-js";

// Generická data-access vrstva nad Supabase. Multi-tenant izolace (organization_id)
// řeší výhradně RLS na straně DB — tahle vrstva o organizaci nic neví.

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
  return (data ?? []) as T[];
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
  return data as T;
}

export async function createRecord<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select()
    .single();
  if (error) throw error;
  return data as T;
}

export async function updateRecord<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as T;
}

export async function deleteRecord(
  supabase: SupabaseClient,
  table: string,
  id: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
