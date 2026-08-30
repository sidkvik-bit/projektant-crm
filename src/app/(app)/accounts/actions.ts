"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";

const BASE_PATH = "/accounts";

export async function createAccount(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateAccount(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}

export async function importAccounts(rows: EntityFormValues[]) {
  const supabase = await createClient();
  const { error } = await supabase.from(entity.table).insert(rows);
  if (error) throw error;
  revalidatePath(BASE_PATH);
  return { imported: rows.length };
}
