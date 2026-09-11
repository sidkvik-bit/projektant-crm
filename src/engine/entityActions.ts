"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecord, updateRecord, deleteRecord } from "./Database";
import type { EntityFormValues } from "./zodSchema";

export async function createEntityRecord(table: string, basePath: string, values: EntityFormValues) {
  const supabase = await createClient();
  const record = await createRecord<{ id: string }>(supabase, table, values);
  revalidatePath(basePath);
  redirect(`${basePath}/${record.id}`);
}

export async function updateEntityRecord(
  table: string,
  basePath: string,
  id: string,
  values: EntityFormValues,
) {
  const supabase = await createClient();
  await updateRecord(supabase, table, id, values);
  revalidatePath(basePath);
  revalidatePath(`${basePath}/${id}`);
}

/** Generický hromadný insert — funguje pro libovolnou tabulku, používá ho ImportWizard. */
export async function bulkInsertRecords(table: string, rows: EntityFormValues[]) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
  return { imported: rows.length };
}

export async function deleteEntityRecord(table: string, basePath: string, id: string) {
  const supabase = await createClient();
  await deleteRecord(supabase, table, id);
  revalidatePath(basePath);
  redirect(basePath);
}

export async function bulkDeleteEntityRecords(table: string, basePath: string, ids: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw error;
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
