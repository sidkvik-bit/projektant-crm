"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOM_ICONS } from "@/customization/client/iconMap";
import { saveComponentDraft } from "@/customization/studioActions";
import type { CustomEntityDef } from "@/customization/types";

/** "Stavební deník" → "new_StavebniDenik" */
export function toEntityName(label: string) {
  const pascal = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("")
    .slice(0, 50);
  return pascal ? `new_${pascal}` : "";
}

export function EntityDialog({
  existing,
  trigger,
}: {
  existing?: { key: string; definition: CustomEntityDef };
  trigger: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const d = existing?.definition;
  const [displayName, setDisplayName] = useState(d?.displayName ?? "");
  const [displayNamePlural, setDisplayNamePlural] = useState(d?.displayNamePlural ?? "");
  const [primaryFieldLabel, setPrimaryFieldLabel] = useState(d?.primaryFieldLabel ?? "Název");
  const [description, setDescription] = useState(d?.description ?? "");
  const [icon, setIcon] = useState(d?.icon ?? "Box");
  const [key, setKey] = useState(existing?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(existing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveComponentDraft("entity", key, key, {
      displayName,
      displayNamePlural,
      primaryFieldLabel,
      icon,
      ...(description ? { description } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Entita ${displayName} uložena do rozpracovaných změn.`);
    setOpen(false);
    router.push(`/settings/customization/${key}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Entita ${existing.key}` : "Nová entita"}</DialogTitle>
          <DialogDescription>
            Vlastní tabulka firmy — dostane seznam, formulář, pohledy a místo v menu. Pole přidáš v dalším kroku.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entity-name">Název (jednotné číslo)</Label>
              <Input
                id="entity-name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (!keyTouched) setKey(toEntityName(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity-plural">Množné číslo (menu)</Label>
              <Input id="entity-plural" value={displayNamePlural} onChange={(e) => setDisplayNamePlural(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity-key">Systémový název</Label>
            <Input
              id="entity-key"
              value={key}
              disabled={Boolean(existing)}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entity-primary">Popisek hlavního pole</Label>
              <Input id="entity-primary" value={primaryFieldLabel} onChange={(e) => setPrimaryFieldLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ikona</Label>
              <Select items={Object.fromEntries(Object.keys(CUSTOM_ICONS).map((k) => [k, k]))} value={icon} onValueChange={(v) => v && setIcon(v)}>
                <SelectTrigger className="w-full" aria-label="Ikona">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CUSTOM_ICONS).map(([name, Icon]) => (
                    <SelectItem key={name} value={name}>
                      <Icon className="size-4" /> {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity-description">Popis (zobrazí se nad seznamem)</Label>
            <Textarea id="entity-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={saving || !displayName || !displayNamePlural || !key}>
            {saving ? "Ukládám…" : "Uložit do rozpracovaných"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
