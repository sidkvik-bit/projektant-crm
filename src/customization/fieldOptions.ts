import type { SupabaseClient } from "@supabase/supabase-js";
import { listRecords } from "@/engine/Database";
import { getOptionSetValues, type OptionSetValue } from "@/engine/optionSets";
import { getOrgUserOptions } from "@/engine/users";
import type { FieldDefinition } from "@/engine/types";
import type { CustomizationSet } from "./merge";
import { resolveEntityRef } from "./registry";

export interface LookupOption {
  id: string;
  label: string;
}

export interface FieldOptions {
  optionSetValues: Record<string, OptionSetValue[]>;
  lookupOptions: Record<string, LookupOption[]>;
}

/** Záznamy entity jako možnosti lookupu (id + popisek z labelFields). */
export async function loadLookupOptions(
  supabase: SupabaseClient,
  targetEntity: string,
  set: CustomizationSet,
): Promise<LookupOption[]> {
  // Uživatelé mají klíč user_id, ne id — mají vlastní dotaz.
  if (targetEntity === "User") return getOrgUserOptions(supabase);
  const ref = resolveEntityRef(targetEntity, set);
  if (!ref) return [];
  const rows = await listRecords<Record<string, unknown>>(supabase, ref.table, {
    select: `id, ${ref.labelFields.join(", ")}`,
    filter: ref.filter,
  });
  return rows.map((r) => ({
    id: r.id as string,
    label: ref.labelFields.map((f) => r[f]).filter(Boolean).join(" ") || "—",
  }));
}

/**
 * Možnosti číselníků a lookupů pro pole, která stránka sama nenačetla — typicky vlastní pole
 * firmy na stránkách psaných ručně (detail projektu…), které o nich nemůžou vědět.
 */
export async function loadMissingFieldOptions(
  supabase: SupabaseClient,
  fields: FieldDefinition[],
  set: CustomizationSet,
  have: { optionSetKeys: string[]; lookupTargets: string[] },
): Promise<FieldOptions> {
  const optionSetKeys = unique(
    fields.filter((f) => f.type === "optionset" && f.optionSetKey).map((f) => f.optionSetKey as string),
  ).filter((k) => !have.optionSetKeys.includes(k));
  const lookupTargets = unique(
    fields.filter((f) => f.type === "lookup" && f.targetEntity).map((f) => f.targetEntity as string),
  ).filter((t) => !have.lookupTargets.includes(t));

  const [sets, lookups] = await Promise.all([
    Promise.all(optionSetKeys.map((key) => getOptionSetValues(supabase, key))),
    Promise.all(lookupTargets.map((target) => loadLookupOptions(supabase, target, set))),
  ]);
  return {
    optionSetValues: Object.fromEntries(optionSetKeys.map((k, i) => [k, sets[i]])),
    lookupOptions: Object.fromEntries(lookupTargets.map((t, i) => [t, lookups[i]])),
  };
}

const unique = <T,>(items: T[]) => Array.from(new Set(items));
