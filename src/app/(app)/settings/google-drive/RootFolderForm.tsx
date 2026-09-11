"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractDriveFolderId } from "@/lib/googleDrive";
import { updateDriveRootFolder } from "./actions";

export function RootFolderForm({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isValid = url.trim() === "" || Boolean(extractDriveFolderId(url));

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateDriveRootFolder(url.trim());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-1.5">
      <Label htmlFor="drive-root-url">Odkaz na root složku</Label>
      <div className="flex items-center gap-2">
        <Input
          id="drive-root-url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
          }}
          placeholder="https://drive.google.com/drive/folders/…"
        />
        <Button type="button" onClick={handleSave} disabled={saving || !isValid}>
          <Save className="size-4" />
          {saving ? "Ukládám…" : "Uložit"}
        </Button>
      </div>
      {!isValid && <p className="text-sm text-destructive">Tohle nevypadá jako platný odkaz na Drive složku.</p>}
      {saved && <p className="text-sm text-status-success">Uloženo.</p>}
      <p className="text-xs text-muted-foreground">
        Pod touhle složkou se budou zakládat podsložky jednotlivých projektů. Tvůj Google účet (a účet každého, kdo
        bude zakládat/nahrávat) musí mít k téhle složce přístup pro zápis.
      </p>
    </div>
  );
}
