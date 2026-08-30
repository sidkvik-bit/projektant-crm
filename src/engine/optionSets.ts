import type { SupabaseClient } from "@supabase/supabase-js";

export interface OptionSetValue {
  id: string;
  value_key: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_default: boolean;
}

/**
 * Načte hodnoty číselníku podle klíče option_setu (option_sets.key), pro
 * aktuální organizaci — RLS zajistí, že se vrátí jen řádky vlastní organizace.
 */
export async function getOptionSetValues(
  supabase: SupabaseClient,
  key: string,
): Promise<OptionSetValue[]> {
  const { data, error } = await supabase
    .from("option_set_values")
    .select("id, value_key, label, color, sort_order, is_default, option_sets!inner(key)")
    .eq("option_sets.key", key)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    value_key: row.value_key as string,
    label: row.label as string,
    color: row.color as string | null,
    sort_order: row.sort_order as number,
    is_default: row.is_default as boolean,
  }));
}

/** Načte hodnoty pro víc číselníků najednou (typicky všechny optionset/lookup pole formuláře). */
export async function getManyOptionSetValues(
  supabase: SupabaseClient,
  keys: string[],
): Promise<Record<string, OptionSetValue[]>> {
  const uniqueKeys = Array.from(new Set(keys));
  const entries = await Promise.all(
    uniqueKeys.map(async (key) => [key, await getOptionSetValues(supabase, key)] as const),
  );
  return Object.fromEntries(entries);
}
