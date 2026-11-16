import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDataApi } from "./dataApi";
import { pluginsFor, type CustomizationSet, type ResolvedPlugin } from "./merge";
import { loadCustomizations } from "./repository";
import { entityNameForTable } from "./registry";
import { runInSandbox } from "./sandbox/serverSandbox";
import type { PluginEvent } from "./types";

// Spouštění serverových pluginů firmy (D365 vzor: pre/post operation). Pluginy jedné entity
// a události běží za sebou podle `order`; before* smí měnit ukládané hodnoty (ctx.setValue)
// nebo operaci zastavit chybou (throw new Error("…") → uvidí ji uživatel). Plugin, který přes
// ctx.api zapíše jiný záznam, spustí jeho pluginy — hloubka je omezená, ať se nezacyklí.

export const MAX_PLUGIN_DEPTH = 3;
const depth = new AsyncLocalStorage<number>();

/** Chyba z pluginu — zpráva je určená uživateli, zobrazí se tak, jak ji plugin napsal. */
export class PluginError extends Error {
  constructor(
    message: string,
    readonly plugin: string,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

/** Výsledek uložení z formuláře: nic = OK, `{ error }` = očekávaná chyba pro uživatele. */
export type SaveResult = { error: string } | void;

/**
 * Chyba z pluginu (validace firmy) je očekávaná — server action ji musí vrátit jako hodnotu,
 * protože text vyhozené chyby Next v produkci schová. Ostatní chyby se vyhazují dál.
 */
export async function returnPluginError<T>(operation: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof PluginError) return { error: err.message };
    throw err;
  }
}

export interface PluginInput {
  entity: string;
  event: PluginEvent;
  recordId?: string | null;
  /** Hodnoty záznamu: u before* to, co se ukládá; u after* uložený záznam. */
  record?: Record<string, unknown> | null;
  /** Stav před změnou (update/delete). */
  before?: Record<string, unknown> | null;
  /** Data události command/invoiceGenerated (vybrané záznamy, id faktury…). */
  input?: Record<string, unknown>;
  /** Spustit jen tenhle plugin (tlačítko volá konkrétní plugin, ne všechny s událostí command). */
  only?: string;
}

export interface PluginOutcome {
  /** Změny hodnot z ctx.setValue (jen before*). */
  changes: Record<string, unknown>;
  /** Návratová hodnota posledního pluginu (u command: { message?, redirect? }). */
  value: unknown;
}

const PLUGIN_PRELUDE = `
function __makeCtx(raw) {
  const changes = {};
  const ctx = Object.assign(raw, {
    setValue(field, value) {
      changes[field] = value === undefined ? null : value;
      if (ctx.record) ctx.record[field] = value;
    },
    api: {
      retrieve: (entity, id) => __call("retrieve", entity, id),
      query: (entity, options) => __call("query", entity, options || {}),
      create: (entity, values) => __call("create", entity, values),
      update: (entity, id, values) => __call("update", entity, id, values),
    },
  });
  Object.defineProperty(ctx, "__extra", { get: () => ({ changes }), enumerable: false });
  return ctx;
}
`;

export async function runPlugins(
  supabase: SupabaseClient,
  set: CustomizationSet,
  input: PluginInput,
): Promise<PluginOutcome> {
  const plugins = pluginsFor(input.entity, input.event, set).filter((p) => !input.only || p.key === input.only);
  const outcome: PluginOutcome = { changes: {}, value: null };
  if (plugins.length === 0) return outcome;

  const currentDepth = depth.getStore() ?? 0;
  if (currentDepth >= MAX_PLUGIN_DEPTH) {
    throw new PluginError(`Pluginy se navzájem spouští příliš hluboko (víc než ${MAX_PLUGIN_DEPTH} úrovně)`, plugins[0].key);
  }

  const api = createDataApi(supabase, set);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let record = input.record ? { ...input.record } : null;

  for (const plugin of plugins) {
    const result = await depth.run(currentDepth + 1, () =>
      runInSandbox({
        code: plugin.code,
        entry: input.event,
        fallbackEntry: "run",
        prelude: PLUGIN_PRELUDE,
        ctx: {
          event: input.event,
          entity: input.entity,
          recordId: input.recordId ?? null,
          record,
          before: input.before ?? null,
          input: input.input ?? {},
          user: { id: user?.id ?? null },
        },
        host: (name, args) => callApi(api, name, args),
      }),
    );

    await writeLog(supabase, plugin, input.event, result.logs, result.ok ? null : result.error, result.durationMs);
    if (!result.ok) throw new PluginError(result.error, plugin.key);

    const { value, extra } = result.value as { value: unknown; extra: { changes?: Record<string, unknown> } | null };
    if (extra?.changes) {
      Object.assign(outcome.changes, extra.changes);
      if (record) record = { ...record, ...extra.changes };
    }
    outcome.value = value;
  }
  return outcome;
}

function callApi(api: ReturnType<typeof createDataApi>, name: string, args: unknown[]): Promise<unknown> {
  const [a, b, c] = args as [string, never, never];
  switch (name) {
    case "retrieve":
      return api.retrieve(a, b);
    case "query":
      return api.query(a, b);
    case "create":
      return api.create(a, b);
    case "update":
      return api.update(a, b, c);
    default:
      return Promise.reject(new Error(`Neznámá operace "${name}"`));
  }
}

async function writeLog(
  supabase: SupabaseClient,
  plugin: ResolvedPlugin,
  event: string,
  logs: string[],
  error: string | null,
  durationMs: number,
) {
  const rows = [
    ...logs.map((message) => ({ level: "log", message })),
    ...(error ? [{ level: "error", message: error }] : []),
  ].map((row) => ({
    ...row,
    message: row.message.slice(0, 4000),
    component_type: "plugin",
    entity_name: plugin.entity,
    key: plugin.key,
    event,
    duration_ms: durationMs,
  }));
  if (rows.length === 0) return;
  // Log je pomůcka pro ladění — když se nezapíše, operace kvůli tomu padat nesmí.
  const { error: logError } = await supabase.from("customization_logs").insert(rows.slice(0, 50));
  if (logError) console.warn("Log pluginu se nepodařilo zapsat:", logError.message);
}

/**
 * Pluginy pro zápis do tabulky — `null`, když tabulka nepatří obchodní entitě nebo firma
 * na ni žádné pluginy nemá. Volá datová vrstva (engine/Database.ts) při každém zápisu.
 */
export async function recordPlugins(supabase: SupabaseClient, table: string, values?: Record<string, unknown>) {
  const entity = entityNameForTable(table, values);
  if (!entity) return null;
  const set = await loadCustomizations(supabase);
  if (set.of("plugin", entity).length === 0) return null;
  return {
    entity,
    run: (event: PluginEvent, input: Omit<PluginInput, "entity" | "event">) => runPlugins(supabase, set, { entity, event, ...input }),
    has: (event: PluginEvent) => pluginsFor(entity, event, set).length > 0,
  };
}
