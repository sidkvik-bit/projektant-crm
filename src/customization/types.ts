import { z } from "zod";

// Komponenty vrstvy úprav firmy (tabulka customization_components). Každá komponenta má typ,
// entitu, ke které patří, klíč a definici — tady jsou jejich tvary a validace. Definice se
// ukládá jako jsonb; validuje se při zápisu (studio, MCP, import) i při čtení, takže rozbitá
// komponenta appku neshodí — jen se přeskočí (viz repository.ts).

export const COMPONENT_TYPES = ["entity", "field", "form", "view", "command", "script", "plugin"] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

/** Prefix vlastních polí a entit — odliší je od základního řešení (D365 publisher prefix). */
export const CUSTOM_PREFIX = "new_";

const identifier = z.string().regex(/^[A-Za-z0-9_]{1,64}$/, "Jen písmena bez diakritiky, číslice a _ (max 64 znaků)");
const customName = z
  .string()
  .regex(/^new_[a-z0-9_]{1,60}$/, "Musí začínat new_ a obsahovat jen malá písmena bez diakritiky, číslice a _");
const customEntityName = z
  .string()
  .regex(/^new_[A-Za-z0-9_]{1,60}$/, "Musí začínat new_ a obsahovat jen písmena bez diakritiky, číslice a _");

// --- entity -----------------------------------------------------------------------------------

export const customEntitySchema = z.object({
  displayName: z.string().min(1).max(80),
  displayNamePlural: z.string().min(1).max(80),
  primaryFieldLabel: z.string().min(1).max(80).default("Název"),
  description: z.string().max(500).optional(),
  /** Název ikony z lucide (např. "Hammer"); neznámá = výchozí ikona. */
  icon: z.string().max(40).optional(),
});
export type CustomEntityDef = z.infer<typeof customEntitySchema>;

// --- field ------------------------------------------------------------------------------------

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "url",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "lookup",
  "optionset",
] as const;

export const customFieldSchema = z
  .object({
    label: z.string().min(1).max(80),
    type: z.enum(CUSTOM_FIELD_TYPES),
    required: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    description: z.string().max(500).optional(),
    /** lookup: logický název cílové entity ("Contact", "new_Zakazka"…). */
    targetEntity: identifier.optional(),
    /** optionset: klíč číselníku (Nastavení → Hodnoty číselníků). */
    optionSetKey: identifier.optional(),
  })
  .refine((f) => f.type !== "lookup" || f.targetEntity, { message: "Lookup musí mít cílovou entitu (targetEntity)" })
  .refine((f) => f.type !== "optionset" || f.optionSetKey, { message: "Číselník musí mít optionSetKey" });
export type CustomFieldDef = z.infer<typeof customFieldSchema>;

// --- form -------------------------------------------------------------------------------------

const handlerSchema = z.object({
  /** Klíč komponenty typu script (u entity formuláře nebo sdílené '*'). */
  script: identifier,
  /** Název exportované funkce ve skriptu. */
  function: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
});
export type ScriptHandler = z.infer<typeof handlerSchema>;

export const formEventsSchema = z.object({
  onLoad: z.array(handlerSchema).optional(),
  onSave: z.array(handlerSchema).optional(),
  onChange: z.record(z.string(), z.array(handlerSchema)).optional(),
});
export type FormEvents = z.infer<typeof formEventsSchema>;

const formSectionSchema = z.object({
  label: z.string(),
  fields: z.array(z.string()),
  ruianLookup: z.boolean().optional(),
});

/** Přepis hlavního formuláře entity (klíč komponenty "main"). Bez `tabs` se ponechá rozložení
 * základního formuláře a přidají se jen události — typické pro "jen přidat skript". */
export const formOverrideSchema = z.object({
  tabs: z.array(z.object({ label: z.string(), sections: z.array(formSectionSchema) })).optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  events: formEventsSchema.optional(),
});
export type FormOverrideDef = z.infer<typeof formOverrideSchema>;

// --- view -------------------------------------------------------------------------------------

export const viewSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  /** Skryje pohled základního řešení se stejným klíčem (name). */
  hidden: z.boolean().optional(),
  columns: z.array(z.object({ field: z.string(), label: z.string().optional() })).optional(),
  defaultSort: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(["eq", "neq", "contains", "notcontains", "startswith", "gt", "lt"]),
        value: z.string(),
      }),
    )
    .optional(),
  overflow: z.boolean().optional(),
  /** Pořadí v přepínači pohledů (nižší dřív). Vlastní pohledy jsou jinak za systémovými. */
  order: z.number().optional(),
});
export type ViewOverrideDef = z.infer<typeof viewSchema>;

// --- command ----------------------------------------------------------------------------------

export const commandSchema = z.object({
  label: z.string().min(1).max(60),
  /** Název ikony z lucide (např. "Send"). */
  icon: z.string().max(40).optional(),
  /** form = lišta na detailu záznamu, list = lišta nad seznamem (akce nad vybranými řádky). */
  location: z.enum(["form", "list"]),
  order: z.number().optional(),
  /** Text potvrzovacího dialogu před spuštěním — vynech pro akce bez rizika. */
  confirm: z.string().max(500).optional(),
  action: z.discriminatedUnion("type", [
    /** Otevře adresu; {id} a {pole} se nahradí hodnotami záznamu. Relativní cesta = v appce. */
    z.object({ type: z.literal("url"), url: z.string().min(1).max(2000), newTab: z.boolean().optional() }),
    /** Spustí funkci klientského skriptu (v prohlížeči, v sandboxu). */
    z.object({ type: z.literal("script"), script: identifier, function: handlerSchema.shape.function }),
    /** Spustí plugin na serveru (událost "command"). */
    z.object({ type: z.literal("plugin"), plugin: identifier }),
  ]),
});
export type CommandDef = z.infer<typeof commandSchema>;

// --- script / plugin --------------------------------------------------------------------------

const MAX_CODE = 100_000;

export const scriptSchema = z.object({
  description: z.string().max(500).optional(),
  code: z.string().max(MAX_CODE),
});
export type ScriptDef = z.infer<typeof scriptSchema>;

export const PLUGIN_EVENTS = [
  "beforeCreate",
  "afterCreate",
  "beforeUpdate",
  "afterUpdate",
  "beforeDelete",
  "afterDelete",
  "command",
  "invoiceGenerated",
] as const;
export type PluginEvent = (typeof PLUGIN_EVENTS)[number];

export const pluginSchema = z.object({
  description: z.string().max(500).optional(),
  events: z.array(z.enum(PLUGIN_EVENTS)).min(1),
  /** Pořadí mezi pluginy stejné entity a události (nižší dřív). */
  order: z.number().optional(),
  code: z.string().max(MAX_CODE),
});
export type PluginDef = z.infer<typeof pluginSchema>;

// --- registr schémat --------------------------------------------------------------------------

export const COMPONENT_SCHEMAS = {
  entity: customEntitySchema,
  field: customFieldSchema,
  form: formOverrideSchema,
  view: viewSchema,
  command: commandSchema,
  script: scriptSchema,
  plugin: pluginSchema,
} satisfies Record<ComponentType, z.ZodTypeAny>;

export interface ComponentDefinitions {
  entity: CustomEntityDef;
  field: CustomFieldDef;
  form: FormOverrideDef;
  view: ViewOverrideDef;
  command: CommandDef;
  script: ScriptDef;
  plugin: PluginDef;
}

/** Komponenta tak, jak ji vidí appka — vybraná vrstva (publikovaná, nebo náhled rozpracované). */
export interface Component<T extends ComponentType = ComponentType> {
  type: T;
  entity: string;
  key: string;
  definition: ComponentDefinitions[T];
}

/** Řádek tabulky customization_components. */
export interface ComponentRow {
  id: string;
  component_type: ComponentType;
  entity_name: string;
  key: string;
  published: unknown;
  draft: unknown;
  draft_deleted: boolean;
  published_at: string | null;
  updated_at: string;
}

/** Pravidla pro klíč komponenty podle typu (nad rámec DB checku). */
export function validateKey(type: ComponentType, entity: string, key: string): string | null {
  if (type === "entity") {
    const r = customEntityName.safeParse(key);
    if (!r.success) return r.error.issues[0].message;
    if (key !== entity) return "U entity musí být klíč stejný jako název entity";
    return null;
  }
  if (type === "field") {
    const r = customName.safeParse(key);
    return r.success ? null : r.error.issues[0].message;
  }
  if (type === "form" && key !== "main") return 'Formulář má zatím jen klíč "main"';
  const r = identifier.safeParse(key);
  return r.success ? null : r.error.issues[0].message;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseDefinition<T extends ComponentType>(type: T, raw: unknown): ParseResult<ComponentDefinitions[T]> {
  const result = COMPONENT_SCHEMAS[type].safeParse(raw);
  if (result.success) return { ok: true, value: result.data as ComponentDefinitions[T] };
  const issue = result.error.issues[0];
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${path}${issue.message}` };
}
