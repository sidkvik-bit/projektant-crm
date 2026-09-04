import { createAdminClient } from "@/lib/supabase/admin";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string | null;
  modifiedTime: string | null;
  size: string | null;
}

export type DriveListResult =
  | { status: "no-folder" }
  | { status: "no-connection" }
  | { status: "no-access" }
  | { status: "error"; message: string }
  | { status: "ok"; files: DriveFile[] };

export type DriveMutationResult =
  | { ok: true; id: string; webViewLink: string }
  | { ok: false; reason: "no-connection" | "no-access" | "error"; message: string };

const FOLDER_ID_PATTERNS = [
  /\/folders\/([a-zA-Z0-9_-]+)/, // https://drive.google.com/drive/folders/<id>[/...]
  /[?&]id=([a-zA-Z0-9_-]+)/, // https://drive.google.com/open?id=<id>
];

/** Vytáhne folder id z běžných tvarů odkazu na Google Drive složku. `null`, když nesedí žádný vzor. */
export function extractDriveFolderId(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const pattern of FOLDER_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function folderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Vymění uložený refresh_token uživatele za čerstvý access_token. `null` = nepřipojeno / token už neplatí. */
export async function getDriveAccessToken(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_drive_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  const refreshToken = (data as { refresh_token: string } | null)?.refresh_token;
  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null; // token revoked/expired — uživatel se musí znovu připojit
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Vrátí obsah Drive složky napojené na projekt (jen top-level, ne rekurzivně) — vždy
 * v rozsahu toho, co reálně vidí PŘIHLÁŠENÝ uživatel ve svém Google účtu (per-user OAuth,
 * ne sdílený service account). Nikdy nevyhazuje — UI si podle `status` zvolí přátelskou hlášku.
 */
export async function getProjectDriveFiles(userId: string, driveUrl: string | null): Promise<DriveListResult> {
  const folderId = extractDriveFolderId(driveUrl);
  if (!folderId) return { status: "no-folder" };

  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { status: "no-connection" };

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, iconLink, modifiedTime, size)",
    orderBy: "folder, name",
    pageSize: "100",
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403 || res.status === 404) return { status: "no-access" };
  if (!res.ok) return { status: "error", message: `Drive API vrátilo chybu (${res.status}).` };

  const json = (await res.json()) as { files?: DriveFile[] };
  return { status: "ok", files: json.files ?? [] };
}

function mutationErrorFromStatus(status: number): Extract<DriveMutationResult, { ok: false }> {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "no-access", message: "Tvůj Google účet nemá pro tuhle akci dostatečná oprávnění." };
  }
  return { ok: false, reason: "error", message: `Drive API vrátilo chybu (${status}).` };
}

/** Založí novou podsložku (jménem projektu) uvnitř dané rodičovské složky. */
export async function createDriveFolder(userId: string, parentFolderId: string, name: string): Promise<DriveMutationResult> {
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { ok: false, reason: "no-connection", message: "Nejsi připojený/á ke Google Drive." };

  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] }),
  });
  if (!res.ok) return mutationErrorFromStatus(res.status);
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { ok: true, id: json.id, webViewLink: json.webViewLink ?? folderUrl(json.id) };
}

/** Nahraje soubor do dané složky (jednoduchý multipart upload — metadata + obsah v jednom requestu). */
export async function uploadDriveFile(userId: string, parentFolderId: string, file: File): Promise<DriveMutationResult> {
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { ok: false, reason: "no-connection", message: "Nejsi připojený/á ke Google Drive." };

  const boundary = `crm-upload-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: file.name, parents: [parentFolderId] });
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
    fileBuffer,
    encoder.encode(`\r\n--${boundary}--`),
  ];
  const body = new Blob(parts);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) return mutationErrorFromStatus(res.status);
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { ok: true, id: json.id, webViewLink: json.webViewLink ?? "" };
}

/**
 * Založí resumable upload session (velké soubory) a vrátí session URL, na kterou
 * klient sám nahraje bajty souboru přímo z prohlížeče — obchází naši server action
 * a její limit velikosti requestu. Session URL je jednorázová a už autorizovaná,
 * takže na PUT s daty se access token znovu neposílá.
 */
export async function startDriveResumableSession(
  userId: string,
  parentFolderId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; uploadUrl: string } | { ok: false; message: string }> {
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { ok: false, message: "Nejsi připojený/á ke Google Drive." };

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
      },
      body: JSON.stringify({ name: fileName, parents: [parentFolderId] }),
    },
  );
  if (!res.ok) {
    const err = mutationErrorFromStatus(res.status);
    return { ok: false, message: err.message };
  }
  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) return { ok: false, message: "Drive nevrátilo adresu pro nahrání souboru." };
  return { ok: true, uploadUrl };
}

/** Přejmenuje soubor/složku. */
export async function renameDriveFile(userId: string, fileId: string, name: string): Promise<DriveMutationResult> {
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { ok: false, reason: "no-connection", message: "Nejsi připojený/á ke Google Drive." };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,webViewLink`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return mutationErrorFromStatus(res.status);
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { ok: true, id: json.id, webViewLink: json.webViewLink ?? "" };
}

/** Přesune soubor/složku do koše na Drive (ne trvalé smazání — jde vrátit zpět přímo na Drive). */
export async function trashDriveFile(userId: string, fileId: string): Promise<DriveMutationResult> {
  const accessToken = await getDriveAccessToken(userId);
  if (!accessToken) return { ok: false, reason: "no-connection", message: "Nejsi připojený/á ke Google Drive." };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) return mutationErrorFromStatus(res.status);
  return { ok: true, id: fileId, webViewLink: "" };
}
