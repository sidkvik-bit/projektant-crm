import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityDefinition } from "./types";
import { getOptionSetValues, type OptionSetValue } from "./optionSets";
import { getOrgUserOptions, type UserOption } from "./users";

/** Společný kontext pro FormEngine — status_reason číselník + seznam vlastníků (Owner). */
export async function getCommonFormContext(supabase: SupabaseClient, entity: EntityDefinition) {
  const [statusReasonValues, ownerOptions] = await Promise.all([
    getOptionSetValues(supabase, entity.statusReasonOptionSetKey),
    getOrgUserOptions(supabase),
  ]);

  return {
    optionSetValues: { [entity.statusReasonOptionSetKey]: statusReasonValues } as Record<
      string,
      OptionSetValue[]
    >,
    lookupOptions: { User: ownerOptions } as Record<string, UserOption[]>,
  };
}
