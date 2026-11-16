import type { SupabaseClient } from "@supabase/supabase-js";
import { baseCatalog } from "@/solutions/Projektant_CRM/catalog";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import type { EntityDefinition } from "@/engine/types";
import { customEntityDefinition, effectiveEntity, type CustomizationSet } from "./merge";
import {
  parseDefinition,
  validateKey,
  type ComponentDefinitions,
  type ComponentType,
  type ScriptHandler,
} from "./types";

// Kontrola komponenty před uložením do draftu a před publikací. Chyby = nejde uložit (appka
// by s tím nefungovala), varování = jde uložit, ale customizer by o tom měl vědět.

export interface ComponentInput {
  type: ComponentType;
  entity: string;
  key: string;
  definition: unknown;
}

export type ValidationResult =
  | { ok: true; value: { definition: unknown; warnings: string[] } }
  | { ok: false; error: string };

const SYSTEM_FIELDS = ["status", "status_reason_id", "status_reason", "owner_id", "owner", "created_at", "updated_at", "id"];

/** Efektivní definice entity (základ + vlastní pole, nebo vlastní entita) ve stavu draftu. */
export function draftEntity(name: string, set: CustomizationSet): EntityDefinition | null {
  const base = baseCatalog[name]?.entity;
  if (base) return effectiveEntity(base, set);
  const custom = set.find("entity", name, name);
  return custom ? customEntityDefinition(custom, set) : null;
}

export async function validateComponent(
  supabase: SupabaseClient,
  set: CustomizationSet,
  input: ComponentInput,
): Promise<ValidationResult> {
  const keyError = validateKey(input.type, input.entity, input.key);
  if (keyError) return { ok: false, error: keyError };

  const parsed = parseDefinition(input.type, input.definition);
  if (!parsed.ok) return parsed;

  if (input.type === "entity") {
    if (baseCatalog[input.key] || entityRegistry[input.key]) return { ok: false, error: "Entita s tímhle názvem už v základu existuje" };
    return { ok: true, value: { definition: parsed.value, warnings: [] } };
  }

  if (!(input.type === "script" && input.entity === "*") && !draftEntity(input.entity, set)) {
    return { ok: false, error: `Entita "${input.entity}" neexistuje (vlastní entitu nejdřív ulož jako komponentu "entity")` };
  }

  const warnings: string[] = [];
  const error = await check(supabase, set, input, parsed.value as ComponentDefinitions[ComponentType], warnings);
  return error ? { ok: false, error } : { ok: true, value: { definition: parsed.value, warnings } };
}

async function check(
  supabase: SupabaseClient,
  set: CustomizationSet,
  input: ComponentInput,
  definition: ComponentDefinitions[ComponentType],
  warnings: string[],
): Promise<string | null> {
  switch (input.type) {
    case "field": {
      const def = definition as ComponentDefinitions["field"];
      const base = baseCatalog[input.entity]?.entity;
      if (base?.fields.some((f) => f.name === input.key)) return `Pole ${input.key} už v entitě je`;
      if (def.type === "lookup" && def.targetEntity !== "User" && !draftEntity(def.targetEntity!, set)) {
        return `Cílová entita lookupu "${def.targetEntity}" neexistuje`;
      }
      if (def.type === "optionset") {
        const { data } = await supabase.from("option_sets").select("id").eq("key", def.optionSetKey!).maybeSingle();
        if (!data) return `Číselník "${def.optionSetKey}" neexistuje — založ ho v Nastavení → Hodnoty číselníků`;
      }
      return null;
    }

    case "form": {
      const def = definition as ComponentDefinitions["form"];
      const entity = draftEntity(input.entity, set)!;
      const known = new Set([...entity.fields.map((f) => f.name), ...SYSTEM_FIELDS]);
      const unknown = (def.tabs ?? []).flatMap((t) => t.sections.flatMap((s) => s.fields)).filter((f) => !known.has(f));
      if (unknown.length) return `Formulář obsahuje neznámá pole: ${unknown.join(", ")}`;
      const handlers = [
        ...(def.events?.onLoad ?? []),
        ...(def.events?.onSave ?? []),
        ...Object.values(def.events?.onChange ?? {}).flat(),
      ];
      for (const field of Object.keys(def.events?.onChange ?? {})) {
        if (!known.has(field)) return `onChange na neznámém poli ${field}`;
      }
      return checkHandlers(handlers, input.entity, set, warnings);
    }

    case "view": {
      const def = definition as ComponentDefinitions["view"];
      const entity = draftEntity(input.entity, set)!;
      const known = new Set([...entity.fields.map((f) => f.name), ...SYSTEM_FIELDS]);
      const isBaseView = baseCatalog[input.entity]?.views.some((v) => v.name === input.key);
      if (!isBaseView && !def.label) return "Nový pohled potřebuje label";
      for (const c of def.conditions ?? []) {
        if (!known.has(c.field)) return `Podmínka na neznámém poli ${c.field}`;
      }
      // Sloupce základních pohledů používají i aliasy (primary_contact…), proto jen varování.
      const odd = (def.columns ?? []).map((c) => c.field).filter((f) => !known.has(f) && !known.has(`${f}_id`));
      if (odd.length) warnings.push(`Sloupce mimo pole entity (zobrazí se prázdné, pokud je stránka nedoplní): ${odd.join(", ")}`);
      return null;
    }

    case "command": {
      const def = definition as ComponentDefinitions["command"];
      if (def.action.type === "script") {
        return checkHandlers([{ script: def.action.script, function: def.action.function }], input.entity, set, warnings);
      }
      if (def.action.type === "plugin") {
        const plugin = set.find("plugin", input.entity, def.action.plugin);
        if (!plugin) return `Plugin ${def.action.plugin} u entity ${input.entity} neexistuje`;
        if (!plugin.definition.events.includes("command")) return `Plugin ${def.action.plugin} nemá událost "command"`;
      }
      if (def.action.type === "url" && /^\s*javascript:/i.test(def.action.url)) return "URL typu javascript: není povolená";
      return null;
    }

    case "script":
    case "plugin": {
      const def = definition as ComponentDefinitions["script"];
      const syntax = syntaxError(def.code);
      if (syntax) return `Chyba syntaxe: ${syntax}`;
      if (input.type === "plugin") {
        const plugin = definition as ComponentDefinitions["plugin"];
        const entries = ["run", ...plugin.events];
        if (!entries.some((name) => definesFunction(plugin.code, name))) {
          return `Plugin musí definovat funkci run(ctx) nebo funkci pojmenovanou podle události (${plugin.events.join(", ")})`;
        }
      }
      return null;
    }
  }
  return null;
}

function checkHandlers(handlers: ScriptHandler[], entity: string, set: CustomizationSet, warnings: string[]): string | null {
  for (const h of handlers) {
    const script = set.find("script", entity, h.script) ?? set.find("script", "*", h.script);
    if (!script) return `Skript ${h.script} neexistuje u entity ${entity} ani mezi sdílenými (*)`;
    if (!definesFunction(script.definition.code, h.function)) {
      warnings.push(`Ve skriptu ${h.script} jsem nenašel funkci ${h.function}`);
    }
  }
  return null;
}

/** Jen překlad kódu, nespouští se — `new Function` tělo neprovede, dokud ji nikdo nezavolá. */
function syntaxError(code: string): string | null {
  try {
    new Function(`return (async () => {\n${code}\n})`);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function definesFunction(code: string, name: string): boolean {
  const n = name.replace(/\$/g, "\\$");
  return new RegExp(`(function\\s+${n}\\s*\\(|(const|let|var)\\s+${n}\\s*=)`).test(code);
}
