"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecord, updateRecord, deleteRecord } from "./Database";
import { foldCustomValues } from "@/customization/customValues";
import { CUSTOM_RECORDS_TABLE } from "@/customization/merge";
import { recordPlugins, returnPluginError, type SaveResult } from "@/customization/plugins";
import type { EntityFormValues } from "./zodSchema";

export async function createEntityRecord(
  table: string,
  basePath: string,
  values: EntityFormValues,
): Promise<SaveResult> {
  const supabase = await createClient();
  const record = await returnPluginError(() => createRecord<{ id: string }>(supabase, table, values));
  if ("error" in record) return record;
  revalidatePath(basePath);
  redirect(`${basePath}/${record.id}`);
}

export async function updateEntityRecord(
  table: string,
  basePath: string,
  id: string,
  values: EntityFormValues,
): Promise<SaveResult> {
  const supabase = await createClient();
  const saved = await returnPluginError(() => updateRecord(supabase, table, id, values));
  if ("error" in saved) return saved as { error: string };
  revalidatePath(basePath);
  revalidatePath(`${basePath}/${id}`);
}

/** Generický hromadný insert — funguje pro libovolnou tabulku, používá ho ImportWizard. Pluginy
 * firmy při importu neběží (hromadný insert jedním dotazem); vlastní pole se uloží. */
export async function bulkInsertRecords(table: string, rows: EntityFormValues[]) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows.map(foldCustomValues));
  if (error) throw error;
  return { imported: rows.length };
}

export async function deleteEntityRecord(table: string, basePath: string, id: string): Promise<SaveResult> {
  const supabase = await createClient();
  const deleted = await returnPluginError(() => deleteRecord(supabase, table, id));
  if (deleted && "error" in deleted) return deleted;
  revalidatePath(basePath);
  redirect(basePath);
}

export async function bulkDeleteEntityRecords(
  table: string,
  basePath: string,
  ids: string[],
): Promise<{ deleted: number; error?: string }> {
  const supabase = await createClient();
  // Má-li firma na mazání pluginy, maže se po jednom, ať proběhnou (a můžou mazání zastavit).
  // U vlastních entit se entita pozná až z řádku, takže tam vždy po jednom.
  const plugins = await recordPlugins(supabase, table);
  if (table === CUSTOM_RECORDS_TABLE || (plugins && (plugins.has("beforeDelete") || plugins.has("afterDelete")))) {
    for (const [index, id] of ids.entries()) {
      const deleted = await returnPluginError(() => deleteRecord(supabase, table, id));
      if (deleted && "error" in deleted) {
        revalidatePath(basePath);
        return { deleted: index, error: deleted.error };
      }
    }
  } else {
    const { error } = await supabase.from(table).delete().in("id", ids);
    if (error) throw error;
  }
  revalidatePath(basePath);
  return { deleted: ids.length };
}

export async function setEntityOwner(table: string, basePath: string, id: string, ownerId: string) {
  const supabase = await createClient();
  await updateRecord(supabase, table, id, { owner_id: ownerId });
  revalidatePath(basePath);
  revalidatePath(`${basePath}/${id}`);
}

/** Založí aktivitu napojenou na libovolný záznam (entity_type/entity_id) — používá ActivityTimeline. */
export async function createTimelineActivity(
  entityType: string,
  entityId: string,
  detailPath: string,
  subject: string,
  description: string,
  activityTypeId: string | null,
  activityDate: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    entity_type: entityType,
    entity_id: entityId,
    subject,
    description: description || null,
    activity_type_id: activityTypeId,
    activity_date: new Date(activityDate).toISOString(),
  });
  if (error) throw error;
  revalidatePath(detailPath);
}

export async function setEntityStatus(
  table: string,
  basePath: string,
  id: string,
  status: "active" | "inactive",
) {
  const supabase = await createClient();
  await updateRecord(supabase, table, id, { status });
  revalidatePath(basePath);
  revalidatePath(`${basePath}/${id}`);
}
