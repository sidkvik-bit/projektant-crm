"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/ProjectTemplate/Entity.json";

const BASE_PATH = "/project-templates";

export async function createProjectTemplate(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateProjectTemplate(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}

export async function addTemplateMilestone(templateId: string, name: string, offsetDni: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("template_milestones")
    .insert({ template_id: templateId, name, offset_dni: offsetDni });
  if (error) throw error;
  revalidatePath(`${BASE_PATH}/${templateId}`);
}

export async function deleteTemplateMilestone(templateId: string, milestoneId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("template_milestones").delete().eq("id", milestoneId);
  if (error) throw error;
  revalidatePath(`${BASE_PATH}/${templateId}`);
}
