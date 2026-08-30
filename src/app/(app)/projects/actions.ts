"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecord, listRecords } from "@/engine/Database";
import { updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";

const BASE_PATH = "/projects";

/** Zkopíruje Template_Milestones do Project_Milestones s dopočtem data (start + offset_dni). */
async function generateMilestonesFromTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  templateId: string,
  startDate: string | null,
) {
  const templateMilestones = await listRecords<{ name: string; offset_dni: number }>(
    supabase,
    "template_milestones",
    { select: "name, offset_dni", filter: { template_id: templateId } },
  );

  if (templateMilestones.length === 0) return;

  const base = startDate ? new Date(startDate) : new Date();
  const rows = templateMilestones.map((tm) => {
    const due = new Date(base);
    due.setDate(due.getDate() + tm.offset_dni);
    return {
      project_id: projectId,
      name: tm.name,
      termin_splneni: due.toISOString().slice(0, 10),
      splneno: false,
    };
  });

  const { error } = await supabase.from("project_milestones").insert(rows);
  if (error) throw error;
}

export async function createProject(values: EntityFormValues) {
  const supabase = await createClient();
  const record = await createRecord<{ id: string }>(supabase, entity.table, values);

  const templateId = values.project_template_id as string | null | undefined;
  if (templateId) {
    await generateMilestonesFromTemplate(
      supabase,
      record.id,
      templateId,
      (values.datum_zahajeni as string | null) ?? null,
    );
  }

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}/${record.id}`);
}

export async function updateProject(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}
