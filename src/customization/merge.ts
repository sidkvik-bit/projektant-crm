import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, FieldDefinition, FormDefinition, ViewDefinition } from "@/engine/types";
import type {
  CommandDef,
  Component,
  ComponentType,
  CustomEntityDef,
  FormEvents,
  PluginDef,
  PluginEvent,
  ScriptDef,
} from "./types";

// Skládání vrstvy úprav nad základní řešení — čisté funkce bez DB, ať jdou testovat a
// ať je jedno, odkud komponenty přišly (publikované, náhled draftu, import).

export const CUSTOM_RECORDS_TABLE = "custom_records";
export const CUSTOM_STATUS_REASON_KEY = "custom_record_status_reason";

/** Komponenty jedné firmy, rozdělené podle typu. */
export class CustomizationSet {
  constructor(readonly components: Component[]) {}

  of<T extends ComponentType>(type: T, entity?: string): Component<T>[] {
    return this.components.filter(
      (c): c is Component<T> => c.type === type && (entity === undefined || c.entity === entity),
    );
  }

  find<T extends ComponentType>(type: T, entity: string, key: string): Component<T> | undefined {
    return this.of(type, entity).find((c) => c.key === key);
  }

  get isEmpty() {
    return this.components.length === 0;
  }
}

export const EMPTY_CUSTOMIZATIONS = new CustomizationSet([]);

/** Vlastní pole entity jako FieldDefinition (název = klíč komponenty, např. "new_cislo_zakazky"). */
export function customFields(set: CustomizationSet, entityName: string): FieldDefinition[] {
  return set.of("field", entityName).map(({ key, definition }) => ({
    name: key,
    label: definition.label,
    type: definition.type,
    required: definition.required,
    readOnly: definition.readOnly,
    targetEntity: definition.targetEntity,
    optionSetKey: definition.optionSetKey,
  }));
}

/** Entita základního řešení rozšířená o vlastní pole firmy. */
export function effectiveEntity(base: EntityDefinition, set: CustomizationSet): EntityDefinition {
  const extra = customFields(set, base.name).filter((f) => !base.fields.some((b) => b.name === f.name));
  return extra.length ? { ...base, fields: [...base.fields, ...extra] } : base;
}

/** Definice vlastní entity — pole jsou vždy vlastní (custom jsonb), primární pole je sloupec `name`. */
export function customEntityDefinition(component: Component<"entity">, set: CustomizationSet): EntityDefinition {
  const def: CustomEntityDef = component.definition;
  return {
    name: component.key,
    table: CUSTOM_RECORDS_TABLE,
    displayName: def.displayName,
    displayNamePlural: def.displayNamePlural,
    primaryField: "name",
    statusReasonOptionSetKey: CUSTOM_STATUS_REASON_KEY,
    fields: [{ name: "name", label: def.primaryFieldLabel, type: "text", required: true }, ...customFields(set, component.key)],
  };
}

/** Výchozí formulář vlastní entity — všechna pole v jedné sekci; firma ho může přepsat. */
export function defaultCustomForm(entity: EntityDefinition): FormDefinition {
  return {
    entity: entity.name,
    columns: 2,
    tabs: [
      {
        label: "Obecné",
        sections: [
          { label: "Základní údaje", fields: entity.fields.map((f) => f.name) },
          { label: "Stav", fields: ["status", "status_reason_id", "owner_id"] },
        ],
      },
    ],
  };
}

/**
 * Formulář s úpravami firmy. Přepis `tabs` nahradí rozložení celé; vlastní pole, která
 * v rozložení nejsou, se přidají do sekce "Vlastní pole", ať nová pole jsou vidět i bez
 * ruční úpravy formuláře.
 */
export function effectiveForm(base: FormDefinition, entity: EntityDefinition, set: CustomizationSet): FormDefinition {
  const override = set.find("form", entity.name, "main")?.definition;
  const form: FormDefinition = {
    ...base,
    tabs: override?.tabs ?? base.tabs,
    columns: override?.columns ?? base.columns,
  };

  const placed = new Set(form.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields)));
  const known = new Set([...entity.fields.map((f) => f.name), "status", "status_reason_id", "status_reason", "owner_id", "owner"]);
  const missing = customFields(set, entity.name)
    .map((f) => f.name)
    .filter((name) => !placed.has(name));

  // Pole z přepisu formuláře, které entita nezná (smazané vlastní pole, překlep), by
  // FormEngine shodilo — tiše je vynecháme, studio na ně upozorní při ukládání.
  const tabs = form.tabs.map((t) => ({
    ...t,
    sections: t.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => known.has(f)) })),
  }));

  if (missing.length && tabs.length) {
    const [first, ...rest] = tabs;
    tabs.splice(0, tabs.length, { ...first, sections: [...first.sections, { label: "Vlastní pole", fields: missing }] }, ...rest);
  }
  return { ...form, tabs };
}

export function formEvents(entityName: string, set: CustomizationSet): FormEvents | undefined {
  return set.find("form", entityName, "main")?.definition.events;
}

/**
 * Pohledy s úpravami firmy: komponenta se stejným klíčem jako pohled základu ho upraví
 * (nebo skryje), jiná přidá nový pohled.
 */
export function effectiveViews(base: ViewDefinition[], entity: EntityDefinition, set: CustomizationSet): ViewDefinition[] {
  const components = set.of("view", entity.name);
  const result: (ViewDefinition & { order?: number })[] = [];

  base.forEach((view, index) => {
    const change = components.find((c) => c.key === view.name)?.definition;
    if (change?.hidden) return;
    result.push({ ...view, ...stripUndefined({ ...change, hidden: undefined }), order: change?.order ?? index });
  });

  for (const { key, definition } of components) {
    if (base.some((v) => v.name === key) || definition.hidden) continue;
    result.push({
      entity: entity.name,
      name: key,
      label: definition.label ?? key,
      columns: definition.columns ?? [{ field: entity.primaryField }],
      defaultSort: definition.defaultSort,
      conditions: definition.conditions ?? [],
      overflow: definition.overflow,
      order: definition.order ?? 1000 + result.length,
    });
  }

  // Výchozí pohled (první) zůstane první, pokud ho firma výslovně nepřeřadila.
  return result
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v.order ?? a.i) - (b.v.order ?? b.i) || a.i - b.i)
    .map(({ v }) => {
      const view = { ...v };
      delete view.order;
      return view as ViewDefinition;
    });
}

/** Výchozí pohledy vlastní entity: Aktivní/Neaktivní/Vše s primárním polem a prvními vlastními poli. */
export function defaultCustomViews(entity: EntityDefinition): ViewDefinition[] {
  const columns = [
    ...entity.fields.slice(0, 5).map((f) => ({ field: f.name })),
    { field: "status_reason", label: "Důvod stavu" },
    { field: "owner", label: "Vlastník" },
  ];
  return buildStatusViews(entity, { entity: entity.name, columns, defaultSort: { field: "created_at", direction: "desc" } });
}

export interface ResolvedCommand extends CommandDef {
  key: string;
}

export function commandsFor(entityName: string, location: CommandDef["location"], set: CustomizationSet): ResolvedCommand[] {
  return set
    .of("command", entityName)
    .filter((c) => c.definition.location === location)
    .map((c) => ({ ...c.definition, key: c.key }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "cs"));
}

export interface ResolvedPlugin extends PluginDef {
  key: string;
  entity: string;
}

export function pluginsFor(entityName: string, event: PluginEvent, set: CustomizationSet): ResolvedPlugin[] {
  return set
    .of("plugin", entityName)
    .filter((c) => c.definition.events.includes(event))
    .map((c) => ({ ...c.definition, key: c.key, entity: c.entity }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key));
}

/** Skripty, které formulář entity potřebuje (její vlastní + sdílené '*'), jako mapa klíč → kód. */
export function scriptsFor(entityName: string, set: CustomizationSet): Record<string, ScriptDef["code"]> {
  return Object.fromEntries(
    [...set.of("script", "*"), ...set.of("script", entityName)].map((c) => [c.key, c.definition.code]),
  );
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
