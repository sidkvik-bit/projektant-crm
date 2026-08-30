"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function basePath(projectId: string) {
  return `/projects/${projectId}`;
}

// --- Milníky ---

export async function addProjectMilestone(projectId: string, name: string, terminSplneni: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_milestones")
    .insert({ project_id: projectId, name, termin_splneni: terminSplneni || null, splneno: false });
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

export async function toggleProjectMilestone(projectId: string, milestoneId: string, splneno: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_milestones")
    .update({ splneno })
    .eq("id", milestoneId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

export async function deleteProjectMilestone(projectId: string, milestoneId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_milestones").delete().eq("id", milestoneId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

export async function createMilestoneNotification(
  projectId: string,
  milestoneId: string,
  type: "EMAIL" | "PUSH",
  dniPredem: number,
  recipientUserId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications_config").insert({
    milestone_id: milestoneId,
    type,
    dni_predem: dniPredem,
    recipient_user_id: recipientUserId,
  });
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

// --- Aktivity ---

export async function addProjectActivity(
  projectId: string,
  subject: string,
  description: string,
  activityTypeId: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    entity_type: "Project",
    entity_id: projectId,
    subject,
    description: description || null,
    activity_type_id: activityTypeId,
    activity_date: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath(basePath(projectId));
}
