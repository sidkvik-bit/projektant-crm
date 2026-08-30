"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecord, updateRecord } from "./Database";
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
