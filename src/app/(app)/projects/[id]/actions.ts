"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function basePath(projectId: string) {
  return `/projects/${projectId}`;
}

// --- Mapa (GPS / adresa z bodu na mapě) ---

/** "Přepsat GPS" — uloží bod vybraný na mapě přímo jako GPS, adresní pole nechá být. */
export async function setProjectGps(projectId: string, lat: number, lng: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ gps_lat: lat, gps_lng: lng }).eq("id", projectId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

/** "Přepsat adresu" — reverse geocoding proběhl už v prohlížeči (ProjectLocationMap.tsx),
 * sem přijde jen hotový výsledek k uložení do adresních polí. GPS se tímhle nemění. */
export async function setProjectAddressFromPoint(
  projectId: string,
  address: { street: string | null; houseNumber: string | null; city: string | null; zip: string | null; country: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      address_street: address.street,
      address_house_number: address.houseNumber,
      address_city: address.city,
      address_zip: address.zip,
      address_country: address.country,
    })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
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

export async function bulkDeleteProjectMilestones(projectId: string, milestoneIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_milestones").delete().in("id", milestoneIds);
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

export async function deleteMilestoneNotification(projectId: string, notificationConfigId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications_config").delete().eq("id", notificationConfigId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}
