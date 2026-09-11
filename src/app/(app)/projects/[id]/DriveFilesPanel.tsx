"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Folder,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  ExternalLink,
  AlertCircle,
  FolderPlus,
  Upload,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConnectDriveButton } from "@/components/ConnectDriveButton";
import {
  createProjectDriveFolder,
  uploadProjectDriveFile,
  startProjectDriveResumableUpload,
  finishProjectDriveUpload,
  renameProjectDriveFile,
  deleteProjectDriveFile,
} from "./driveActions";
import { RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "@/lib/driveUploadConfig";
import type { DriveListResult } from "@/lib/googleDrive";

function iconFor(mimeType: string) {
  if (mimeType === "application/vnd.google-apps.folder") return Folder;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("spreadsheet")) return FileSpreadsheet;
  if (mimeType.includes("document") || mimeType.includes("text")) return FileText;
  return FileIcon;
}

function formatSize(bytes: string | null) {
  if (!bytes) return null;
  const n = Number(bytes);
  if (!n) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Hint({ children, driveUrl }: { children: React.ReactNode; driveUrl: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>{children}</p>
      </div>
      <Link
        href={driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-primary hover:underline"
      >
        Otevřít složku přímo na Drive →
      </Link>
    </div>
  );
}

/**
 * Zrcadlí obsah Drive složky napojené na projekt a umožní s ní (v rozsahu toho, co
 * reálně dovolí Google účet přihlášeného uživatele) hýbat — založit ji, nahrát do ní
 * soubor, přejmenovat nebo smazat (do koše na Drive, ne natrvalo).
 */
export function DriveFilesPanel({
  projectId,
  projectName,
  driveUrl,
  result,
}: {
  projectId: string;
  projectName: string;
  driveUrl: string | null;
  result: DriveListResult;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Něco se nepovedlo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    try {
      if (file.size >= RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
        // Velký soubor — bajty jdou rovnou z prohlížeče na Drive, náš server jen zprostředkuje
        // autorizovanou upload URL (obchází limit velikosti requestu na server action).
        const uploadUrl = await startProjectDriveResumableUpload(
          projectId,
          driveUrl ?? "",
          file.name,
          file.type || "application/octet-stream",
        );
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Nahrání velkého souboru na Drive se nezdařilo.");
        await finishProjectDriveUpload(projectId);
      } else {
        const formData = new FormData();
        formData.append("file", file);
        await uploadProjectDriveFile(projectId, driveUrl ?? "", formData);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání se nezdařilo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRenameSubmit(fileId: string) {
    await run(() => renameProjectDriveFile(projectId, fileId, renameValue));
    setRenamingId(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteProjectDriveFile(projectId, deleteTarget.id);
      router.refresh();
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Smazání se nezdařilo.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const needsReconnect = error?.includes("připojený");

  if (result.status === "no-folder") {
    return (
      <div className="space-y-2">
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <p>K tomuto projektu zatím není napojená složka na Google Drive.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => run(() => createProjectDriveFolder(projectId, projectName))} disabled={busy}>
            <FolderPlus className="size-4" />
            {busy ? "Zakládám…" : "Vytvořit složku na Drive"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {needsReconnect && <ConnectDriveButton />}
      </div>
    );
  }

  if (result.status === "no-connection") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>Pro zobrazení obsahu složky se potřebuješ připojit ke Google Drive.</p>
        <ConnectDriveButton />
      </div>
    );
  }

  if (result.status === "no-access") {
    return (
      <Hint driveUrl={driveUrl!}>
        Tvůj Google účet nemá k téhle složce přístup. Požádej o sdílení, nebo zkontroluj, jestli odkaz vede na
        správnou složku.
      </Hint>
    );
  }

  if (result.status === "error") {
    return <Hint driveUrl={driveUrl!}>Obsah složky se teď nepodařilo načíst. Zkus to prosím znovu později.</Hint>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="size-4" />
          {uploading ? "Nahrávám…" : "Nahrát soubor"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result.files.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Tahle složka je zatím prázdná.</p>
      ) : (
        <div className="space-y-1.5">
          {result.files.map((file) => {
            const Icon = iconFor(file.mimeType);
            const size = formatSize(file.size);
            const isRenaming = renamingId === file.id;
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {isRenaming ? (
                  <>
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(file.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                      className="h-7 flex-1"
                    />
                    <Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => handleRenameSubmit(file.id)}>
                      <Check className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setRenamingId(null)}>
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                    >
                      {file.name}
                    </a>
                    {size && <span className="shrink-0 text-xs text-muted-foreground">{size}</span>}
                    {file.modifiedTime && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(file.modifiedTime).toLocaleDateString("cs-CZ")}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Přejmenovat"
                      onClick={() => {
                        setRenamingId(file.id);
                        setRenameValue(file.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Přesunout do koše"
                      onClick={() => setDeleteTarget({ id: file.id, name: file.name })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" title="Otevřít na Drive">
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přesunout „{deleteTarget?.name}“ do koše?</DialogTitle>
            <DialogDescription>
              Soubor zmizí ze složky projektu. Zůstane v koši na Google Drive, odkud jde vrátit zpět.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteBusy}>
              {deleteBusy ? "Přesouvám…" : "Přesunout do koše"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
