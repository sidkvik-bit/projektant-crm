"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { saveComponentDraft } from "@/customization/studioActions";
import { CUSTOM_FIELD_TYPES, type CustomFieldDef } from "@/customization/types";

export const FIELD_TYPE_LABELS: Record<(typeof CUSTOM_FIELD_TYPES)[number], string> = {
  text: "Text",
  textarea: "Víceřádkový text",
  email: "E-mail",
  phone: "Telefon",
  url: "Odkaz (URL)",
  number: "Číslo",
  currency: "Částka",
  date: "Datum",
  datetime: "Datum a čas",
  boolean: "Ano/Ne",
  lookup: "Odkaz na záznam (lookup)",
  optionset: "Výběr z číselníku",
};

/** "Číslo zakázky" → "new_cislo_zakazky" */
export function toCustomName(label: string) {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return slug ? `new_${slug}` : "";
}

export function FieldDialog({
  entity,
  existing,
  entities,
  optionSets,
  trigger,
}: {
  entity: string;
  existing?: { key: string; definition: CustomFieldDef };
  entities: { name: string; label: string }[];
  optionSets: { key: string; label: string }[];
  trigger: ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = existing?.definition;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState(existing?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(existing));
  const [type, setType] = useState<CustomFieldDef["type"]>(initial?.type ?? "text");
  const [required, setRequired] = useState(Boolean(initial?.required));
  const [readOnly, setReadOnly] = useState(Boolean(initial?.readOnly));
  const [targetEntity, setTargetEntity] = useState(initial?.targetEntity ?? "");
  const [optionSetKey, setOptionSetKey] = useState(initial?.optionSetKey ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const definition: CustomFieldDef = {
      label,
      type,
      ...(required ? { required } : {}),
      ...(readOnly ? { readOnly } : {}),
      ...(description ? { description } : {}),
      ...(type === "lookup" ? { targetEntity } : {}),
      ...(type === "optionset" ? { optionSetKey } : {}),
    };
    const result = await saveComponentDraft("field", entity, key, definition);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Pole ${label} uloženo do rozpracovaných změn.`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Pole ${existing.key}` : "Nové pole"}</DialogTitle>
          <DialogDescription>
            Vlastní pole se přidá na konec formuláře (sekce Vlastní pole), pokud ho do formuláře nezařadíš jinam.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="field-label">Popisek</Label>
            <Input
              id="field-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!keyTouched) setKey(toCustomName(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-key">Systémový název</Label>
            <Input
              id="field-key"
              value={key}
              disabled={Boolean(existing)}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">Začíná new_, po vytvoření nejde změnit (hodnoty jsou uložené pod ním).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select
              items={FIELD_TYPE_LABELS}
              value={type}
              onValueChange={(v) => v && setType(v as CustomFieldDef["type"])}
              disabled={Boolean(existing)}
            >
              <SelectTrigger className="w-full" aria-label="Typ pole">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "lookup" && (
            <div className="space-y-1.5">
              <Label>Cílová entita</Label>
              <Select
                items={Object.fromEntries([["User", "Uživatel"], ...entities.map((e) => [e.name, e.label])])}
                value={targetEntity}
                onValueChange={(v) => setTargetEntity(v ?? "")}
              >
                <SelectTrigger className="w-full" aria-label="Cílová entita">
                  <SelectValue placeholder="Vyberte…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">Uživatel</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.name} value={e.name}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "optionset" && (
            <div className="space-y-1.5">
              <Label>Číselník</Label>
              <Select
                items={Object.fromEntries(optionSets.map((o) => [o.key, o.label]))}
                value={optionSetKey}
                onValueChange={(v) => setOptionSetKey(v ?? "")}
              >
                <SelectTrigger className="w-full" aria-label="Číselník">
                  <SelectValue placeholder="Vyberte…" />
                </SelectTrigger>
                <SelectContent>
                  {optionSets.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Nový číselník založíš v Nastavení → Hodnoty číselníků.</p>
            </div>
          )}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(c) => setRequired(Boolean(c))} /> Povinné
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={readOnly} onCheckedChange={(c) => setReadOnly(Boolean(c))} /> Jen pro čtení
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-description">Popis (pro ostatní customizéry)</Label>
            <Textarea id="field-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={saving || !label || !key}>
            {saving ? "Ukládám…" : "Uložit do rozpracovaných"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
