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

// --- Tým projektu (project_contacts) ---
//
// Tým je vazba projekt ↔ kontakt s rolí, ne kontakty klientovy firmy. Díky tomu jde k projektu
// přiřadit statika nebo geodeta, kteří pracují úplně jinde. organization_id doplní systémový
// trigger, stejně jako u ostatních tabulek.

export async function addProjectContact(projectId: string, contactId: string, roleId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_contacts")
    .insert({ project_id: projectId, contact_id: contactId, role_id: roleId || null });
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

export async function removeProjectContact(projectId: string, memberId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_contacts").delete().eq("id", memberId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

/**
 * Posun termínu milníku. Tester si vybral šablonu, ta nasypala milníky podle přednastavených
 * odstupů — a pak s nimi nešlo hnout, jedinou cestou bylo smazat je a naklikat znovu.
 */
export async function setProjectMilestoneDate(
  projectId: string,
  milestoneId: string,
  terminSplneni: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_milestones")
    .update({ termin_splneni: terminSplneni || null })
    .eq("id", milestoneId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

// --- Parcely projektu ---
//
// Projektant běžně staví na několika parcelách a katastr rozlišuje stavební a pozemkové.
// Dřív na to bylo jedno textové pole, do kterého se to psalo dohromady.

export interface NewProjectParcel {
  parcelniCislo: string;
  druh: "stavebni" | "pozemkova";
  katastralniUzemi: string | null;
  /** Výměra v m² z katastru; u ručně zapsané parcely bývá prázdná. */
  vymeraM2: number | null;
}

export async function addProjectParcel(projectId: string, parcel: NewProjectParcel) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_parcels").insert({
    project_id: projectId,
    parcelni_cislo: parcel.parcelniCislo,
    druh: parcel.druh,
    katastralni_uzemi: parcel.katastralniUzemi || null,
    vymera_m2: parcel.vymeraM2,
  });
  if (error) throw error;
  revalidatePath(basePath(projectId));
}

export async function deleteProjectParcel(projectId: string, parcelId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_parcels").delete().eq("id", parcelId);
  if (error) throw error;
  revalidatePath(basePath(projectId));
}
