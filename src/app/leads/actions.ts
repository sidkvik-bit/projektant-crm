"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createRecord, updateRecord } from "@/engine/Database";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";

export async function createLead(values: EntityFormValues) {
  const supabase = await createClient();
  const record = await createRecord<{ id: string }>(supabase, entity.table, values);
  revalidatePath("/leads");
  redirect(`/leads/${record.id}`);
}

export async function updateLead(id: string, values: EntityFormValues) {
  const supabase = await createClient();
  await updateRecord(supabase, entity.table, id, values);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}
