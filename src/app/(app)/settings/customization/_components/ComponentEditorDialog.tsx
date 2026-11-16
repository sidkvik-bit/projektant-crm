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
import { saveComponentDraft } from "@/customization/studioActions";
import { PLUGIN_EVENTS, type ComponentType, type PluginEvent } from "@/customization/types";
import { CodeArea } from "./CodeArea";

const TITLES: Partial<Record<ComponentType, string>> = {
  form: "Formulář",
  view: "Pohled",
  command: "Tlačítko",
  script: "Klientský skript",
  plugin: "Serverový plugin",
};

const EVENT_LABELS: Record<PluginEvent, string> = {
  beforeCreate: "Před vytvořením",
  afterCreate: "Po vytvoření",
  beforeUpdate: "Před uložením změn",
  afterUpdate: "Po uložení změn",
  beforeDelete: "Před smazáním",
  afterDelete: "Po smazání",
  command: "Tlačítko (command)",
  invoiceGenerated: "Faktura vygenerována z nabídky",
};

type Definition = Record<string, unknown>;

/**
 * Editor komponenty, která se nejlíp píše jako JSON (formulář, pohled, tlačítko) nebo kód
 * (skript, plugin). Ukládá do draftu — uživatelé změnu uvidí až po publikování.
 */
export function ComponentEditorDialog({
  type,
  entity,
  componentKey,
  initial,
  trigger,
  fixedKey,
  keyHint,
}: {
  type: Exclude<ComponentType, "entity" | "field">;
  entity: string;
  /** Existující komponenta — klíč nejde měnit. */
  componentKey?: string;
  initial: unknown;
  trigger: ReactElement;
  /** Nová komponenta s pevným klíčem (formulář "main", úprava pohledu základu). */
  fixedKey?: string;
  keyHint?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const def = (initial ?? {}) as Definition;
  const [key, setKey] = useState(componentKey ?? fixedKey ?? "");
  const [json, setJson] = useState(() => JSON.stringify(def, null, 2));
  const [code, setCode] = useState(String(def.code ?? ""));
  const [description, setDescription] = useState(String(def.description ?? ""));
  const [events, setEvents] = useState<PluginEvent[]>((def.events as PluginEvent[] | undefined) ?? ["beforeCreate"]);
  const [order, setOrder] = useState(def.order === undefined ? "" : String(def.order));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isCode = type === "script" || type === "plugin";

  function buildDefinition(): Definition {
    if (type === "script") return { ...(description ? { description } : {}), code };
    if (type === "plugin") {
      return {
        ...(description ? { description } : {}),
        events,
        ...(order.trim() ? { order: Number(order) } : {}),
        code,
      };
    }
    try {
      return JSON.parse(json) as Definition;
    } catch (err) {
      throw new Error(`Neplatný JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function save() {
    setError(null);
    let definition: Definition;
    try {
      definition = buildDefinition();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setSaving(true);
    const result = await saveComponentDraft(type, entity, key.trim(), definition);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    result.value.warnings.forEach((w) => toast.warning(w));
    toast.success("Uloženo do rozpracovaných změn — uživatelé to uvidí po publikování.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {TITLES[type]} — {entity === "*" ? "sdílené" : entity}
            {componentKey ? ` / ${componentKey}` : ""}
          </DialogTitle>
          <DialogDescription>
            Uloží se jako rozpracovaná změna. V aplikaci ji uvidíš v náhledu, ostatní až po publikování.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!componentKey && !fixedKey && (
            <div className="space-y-1.5">
              <Label htmlFor="component-key">Klíč (název bez diakritiky)</Label>
              <Input id="component-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyHint} />
            </div>
          )}

          {isCode && (
            <div className="space-y-1.5">
              <Label htmlFor="component-description">Popis</Label>
              <Input id="component-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          )}

          {type === "plugin" && (
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Události</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PLUGIN_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={events.includes(event)}
                        onCheckedChange={(checked) =>
                          setEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)))
                        }
                      />
                      {EVENT_LABELS[event]} <code className="text-xs text-muted-foreground">{event}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="plugin-order">Pořadí</Label>
                <Input id="plugin-order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
              </div>
            </div>
          )}

          {isCode ? (
            <CodeArea ariaLabel="Kód" value={code} onChange={setCode} rows={22} />
          ) : (
            <CodeArea ariaLabel="Definice (JSON)" value={json} onChange={setJson} rows={22} />
          )}

          {error && <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={saving || !key.trim()}>
            {saving ? "Ukládám…" : "Uložit do rozpracovaných"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
