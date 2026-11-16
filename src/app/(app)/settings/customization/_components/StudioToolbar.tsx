"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Rocket, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPackage, importPackage, setPreviewMode } from "@/customization/studioActions";

export function StudioToolbar({ preview, pendingCount }: { preview: boolean; pendingCount: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function doExport() {
    setBusy(true);
    const result = await exportPackage();
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upravy-firmy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File) {
    setBusy(true);
    const result = await importPackage(await file.text());
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!result.ok) return toast.error(result.error);
    result.value.warnings.forEach((w) => toast.warning(w));
    toast.success(`Importováno ${result.value.imported} komponent do rozpracovaných změn — zkontroluj a publikuj.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => startTransition(() => setPreviewMode(!preview))}
        title="V náhledu vidíš v aplikaci i nepublikované změny (jen ty)."
      >
        {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {preview ? "Ukončit náhled" : "Náhled změn"}
      </Button>
      <Button size="sm" render={<Link href="/settings/customization/publish" />} disabled={pendingCount === 0}>
        <Rocket className="size-4" />
        Publikovat{pendingCount ? ` (${pendingCount})` : ""}
      </Button>
      <Button variant="ghost" size="sm" onClick={doExport} disabled={busy}>
        <Download className="size-4" />
        Export
      </Button>
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload className="size-4" />
        Import
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Soubor s úpravami"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void doImport(file);
        }}
      />
    </div>
  );
}
