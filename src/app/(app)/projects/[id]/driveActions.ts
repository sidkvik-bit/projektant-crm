"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createDriveFolder,
  uploadDriveFile,
  startDriveResumableSession,
  renameDriveFile,
  trashDriveFile,
  extractDriveFolderId,
} from "@/lib/googleDrive";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");
  return { supabase, userId: user.id };
}

/** Založí Drive podsložku pojmenovanou po projektu, uvnitř organizace nastavené root složky. */
export async function createProjectDriveFolder(projectId: string, projectName: string) {
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", userId)
    .single();
  const { data: org } = await supabase
    .from("organizations")
    .select("drive_root_folder_url")
    .eq("id", profile!.organization_id)
    .single();
  const rootFolderId = extractDriveFolderId(org?.drive_root_folder_url ?? null);
  if (!rootFolderId) throw new Error("Nejdřív nastav root složku v Nastavení → Google Drive.");

  const result = await createDriveFolder(userId, rootFolderId, projectName);
  if (!result.ok) throw new Error(result.message);

  const { error } = await supabase.from("projects").update({ drive_url: result.webViewLink }).eq("id", projectId);
  if (error) throw error;

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadProjectDriveFile(projectId: string, folderUrl: string, formData: FormData) {
  const { userId } = await requireUser();
  const folderId = extractDriveFolderId(folderUrl);
  if (!folderId) throw new Error("Projekt nemá napojenou složku.");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Nevybral/a jsi soubor.");

  const result = await uploadDriveFile(userId, folderId, file);
  if (!result.ok) throw new Error(result.message);

  revalidatePath(`/projects/${projectId}`);
}

/** Založí resumable upload session pro velký soubor — klient pak na `uploadUrl` nahraje bajty přímo. */
export async function startProjectDriveResumableUpload(
  projectId: string,
  folderUrl: string,
  fileName: string,
  mimeType: string,
) {
  const { userId } = await requireUser();
  const folderId = extractDriveFolderId(folderUrl);
  if (!folderId) throw new Error("Projekt nemá napojenou složku.");

  const result = await startDriveResumableSession(userId, folderId, fileName, mimeType);
  if (!result.ok) throw new Error(result.message);
  return result.uploadUrl;
}

/** Po dokončení resumable uploadu (proběhl mimo server actions) jen obnoví data stránky. */
export async function finishProjectDriveUpload(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

export async function renameProjectDriveFile(projectId: string, fileId: string, newName: string) {
  const { userId } = await requireUser();
  if (!newName.trim()) throw new Error("Název nemůže být prázdný.");

  const result = await renameDriveFile(userId, fileId, newName.trim());
  if (!result.ok) throw new Error(result.message);

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectDriveFile(projectId: string, fileId: string) {
  const { userId } = await requireUser();

  const result = await trashDriveFile(userId, fileId);
  if (!result.ok) throw new Error(result.message);

  revalidatePath(`/projects/${projectId}`);
}
