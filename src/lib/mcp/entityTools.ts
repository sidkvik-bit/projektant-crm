import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createRecord, getRecordById, updateRecord } from "@/engine/Database";
import { getOptionSetValues, type OptionSetValue } from "@/engine/optionSets";
import type { EntityDefinition } from "@/engine/types";
import { dbColumnRef, unfoldCustomValues } from "@/customization/customValues";
import { CUSTOM_RECORDS_TABLE, customEntityDefinition, effectiveEntity, type CustomizationSet } from "@/customization/merge";
import { returnPluginError } from "@/customization/plugins";
import { listComponentRows, toCustomizationSet } from "@/customization/repository";
import { baseCatalog } from "@/solutions/Projektant_CRM/catalog";
import { labelOptionValues, prepareValues, systemFields } from "./entityValues";
import { MAX_ROWS, fail, ok, sessionFrom } from "./shared";

/**
 * Obecné nástroje nad metadaty entit — umí každou entitu základu (zájemci, firmy, kontakty,
 * projekty, nabídky, faktury, aktivity, šablony, bugy) i vlastní entity firmy, se stejnou
 * validací jako formulář ve webu. Zápis jde přes datovou vrstvu (pluginy firmy proběhnou)
 * a klientem přihlášeného uživatele (RLS). Mazání tu není — viz request_delete.
 */

async function loadEntities(supabase: SupabaseClient) {
  const set: CustomizationSet = toCustomizationSet(await listComponentRows(supabase), false);
  const entities = new Map<string, EntityDefinition>();
  for (const [name, entry] of Object.entries(baseCatalog)) entities.set(name, effectiveEntity(entry.entity, set));
  for (const component of set.of("entity")) entities.set(component.key, customEntityDefinition(component, set));
  return entities;
}

async function loadEntity(
  supabase: SupabaseClient,
  name: string,
): Promise<{ entity: EntityDefinition } | { error: string }> {
  const entities = await loadEntities(supabase);
  const entity = entities.get(name);
  return entity
    ? { entity }
    : { error: `Neznámá entita "${name}". Dostupné: ${[...entities.keys()].join(", ")}.` };
}

async function loadOptions(supabase: SupabaseClient, entity: EntityDefinition) {
  const keys = new Set(
    [...entity.fields, ...systemFields(entity)].map((f) => f.optionSetKey).filter((k): k is string => Boolean(k)),
  );
  const options: Record<string, OptionSetValue[]> = {};
  await Promise.all(
    [...keys].map(async (key) => {
      options[key] = await getOptionSetValues(supabase, key).catch(() => []);
    }),
  );
  return options;
}

const isCustom = (entity: EntityDefinition) => entity.table === CUSTOM_RECORDS_TABLE;

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err));

export function registerEntityTools(server: McpServer) {
  server.registerTool(
    "describe_entity",
    {
      title: "Pole entity",
      description:
        "Bez parametru vypíše všechny entity (i vlastní entity firmy). S entitou vrátí její pole: typ, povinnost, hodnoty číselníků a cílovou entitu u odkazů. Zavolej před create_record / update_record.",
      inputSchema: z.object({ entity: z.string().optional().describe('Např. "Quote", "Invoice", "Bug", "new_Zakazka"') }),
      annotations: { readOnlyHint: true },
    },
    async ({ entity: name }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const entities = await loadEntities(session.supabase);
      if (!name) {
        return ok([...entities.values()].map((e) => ({ entity: e.name, nazev: e.displayNamePlural, vlastni: isCustom(e) })));
      }
      const entity = entities.get(name);
      if (!entity) return fail(`Neznámá entita "${name}". Dostupné: ${[...entities.keys()].join(", ")}.`);
      const options = await loadOptions(session.supabase, entity);
      return ok({
        entity: entity.name,
        nazev: entity.displayName,
        hlavni_pole: entity.primaryField,
        pole: [
          { name: "status", type: "optionset", hodnoty: ["active", "inactive"] },
          ...[...entity.fields, ...systemFields(entity)].map((f) => ({
            name: f.name,
            label: f.label,
            type: f.type,
            ...(f.required ? { povinne: true } : {}),
            ...(f.readOnly ? { jen_cteni: true } : {}),
            ...(f.targetEntity ? { odkaz_na: f.targetEntity } : {}),
            ...(f.optionSetKey ? { hodnoty: (options[f.optionSetKey] ?? []).map((v) => v.label) } : {}),
          })),
        ],
      });
    },
  );

  server.registerTool(
    "list_records",
    {
      title: "Záznamy entity",
      description:
        "Vypíše záznamy libovolné entity (nejnověji upravené první, po stránkách). Filtr je rovnost na pole (i vlastní new_…); search hledá v hlavním poli (název). Pro zájemce, kontakty, firmy a projekty jsou přehlednější list_leads / list_contacts / list_accounts / list_projects.",
      inputSchema: z.object({
        entity: z.string(),
        search: z.string().optional(),
        filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        include_inactive: z.boolean().optional().describe("Zahrnout i neaktivní záznamy"),
        limit: z.number().int().min(1).max(MAX_ROWS).optional().describe("Výchozí 20"),
        offset: z.number().int().min(0).optional().describe("Kolik záznamů přeskočit (další stránka)"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ entity: name, search, filter, include_inactive, limit, offset }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const loaded = await loadEntity(session.supabase, name);
      if ("error" in loaded) return fail(loaded.error);
      const { entity } = loaded;
      const known = new Set(["status", "id", ...[...entity.fields, ...systemFields(entity)].map((f) => f.name)]);
      const unknown = Object.keys(filter ?? {}).filter((k) => !known.has(k));
      if (unknown.length) return fail(`Neznámá pole ve filtru: ${unknown.join(", ")}. Viz describe_entity.`);

      let query = session.supabase.from(entity.table).select("*");
      if (isCustom(entity)) query = query.eq("entity_name", entity.name);
      if (!include_inactive && !(filter && "status" in filter)) query = query.eq("status", "active");
      for (const [field, value] of Object.entries(filter ?? {})) {
        query = value === null ? query.is(dbColumnRef(field), null) : query.eq(dbColumnRef(field), value);
      }
      if (search) query = query.ilike(dbColumnRef(entity.primaryField), `%${search}%`);
      const pageSize = limit ?? 20;
      const start = offset ?? 0;
      // O jeden víc, ať se pozná, jestli existuje další stránka.
      const { data, error } = await query.order("updated_at", { ascending: false }).range(start, start + pageSize);
      if (error) return fail(error.message);
      const rows = (data ?? []).slice(0, pageSize);

      const options = await loadOptions(session.supabase, entity);
      return ok({
        zaznamy: rows.map((row) => labelOptionValues(entity, unfoldCustomValues(row as Record<string, unknown>), options)),
        ...((data ?? []).length > pageSize ? { dalsi_stranka: { offset: start + pageSize } } : {}),
      });
    },
  );

  server.registerTool(
    "get_record",
    {
      title: "Detail záznamu",
      description: "Vrátí jeden záznam libovolné entity se všemi poli (i vlastními new_…).",
      inputSchema: z.object({ entity: z.string(), id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async ({ entity: name, id }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const loaded = await loadEntity(session.supabase, name);
      if ("error" in loaded) return fail(loaded.error);
      const row = await getRecordById<Record<string, unknown>>(session.supabase, loaded.entity.table, id).catch(() => null);
      if (!row || (isCustom(loaded.entity) && row.entity_name !== name)) return fail("Záznam neexistuje nebo k němu nemáš přístup.");
      return ok(labelOptionValues(loaded.entity, row, await loadOptions(session.supabase, loaded.entity)));
    },
  );

  server.registerTool(
    "create_record",
    {
      title: "Založit záznam",
      description:
        "Založí záznam libovolné entity (nabídka, faktura, aktivita, bug, šablona, vlastní entita…). Pole podle describe_entity; u číselníků stačí název hodnoty, u odkazů id. Na zájemce, firmy, kontakty, projekty a nabídky jsou specializované create_lead / create_account / create_contact / create_project / create_quote (umí víc, např. adresu nebo fáze nabídky); tento použij pro ostatní entity a vlastní pole new_*. Používej jen na výslovnou žádost uživatele.",
      inputSchema: z.object({ entity: z.string(), values: z.record(z.string(), z.unknown()) }),
    },
    async ({ entity: name, values }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const loaded = await loadEntity(session.supabase, name);
      if ("error" in loaded) return fail(loaded.error);
      const { entity } = loaded;
      const options = await loadOptions(session.supabase, entity);
      const prepared = prepareValues(entity, values, options, "create");
      if (!prepared.ok) return fail(`Neplatné hodnoty:\n${prepared.errors.join("\n")}`);

      const payload = isCustom(entity) ? { ...prepared.values, entity_name: entity.name } : prepared.values;
      const created = await returnPluginError(() =>
        createRecord<Record<string, unknown>>(session.supabase, entity.table, payload),
      ).catch((err) => ({ error: `Založení selhalo: ${errorText(err)}` }));
      if ("error" in created) return fail(String(created.error));
      return ok({ vytvoreno: labelOptionValues(entity, created, options) });
    },
  );

  server.registerTool(
    "update_record",
    {
      title: "Upravit záznam",
      description:
        "Upraví pole záznamu libovolné entity a vrátí hodnoty před a po — ukaž uživateli, co se změnilo. Prázdná hodnota = null. U projektů dej přednost update_project (dopočítá GPS z adresy). Používej jen na výslovnou žádost uživatele.",
      inputSchema: z.object({ entity: z.string(), id: z.string().uuid(), values: z.record(z.string(), z.unknown()) }),
    },
    async ({ entity: name, id, values }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const loaded = await loadEntity(session.supabase, name);
      if ("error" in loaded) return fail(loaded.error);
      const { entity } = loaded;
      const options = await loadOptions(session.supabase, entity);
      const prepared = prepareValues(entity, values, options, "update");
      if (!prepared.ok) return fail(`Neplatné hodnoty:\n${prepared.errors.join("\n")}`);

      const before = await getRecordById<Record<string, unknown>>(session.supabase, entity.table, id).catch(() => null);
      if (!before || (isCustom(entity) && before.entity_name !== name)) {
        return fail("Záznam neexistuje nebo k němu nemáš přístup.");
      }
      const after = await returnPluginError(() =>
        updateRecord<Record<string, unknown>>(session.supabase, entity.table, id, prepared.values),
      ).catch((err) => ({ error: `Úprava selhala: ${errorText(err)}` }));
      if ("error" in after) return fail(String(after.error));

      const pick = (row: Record<string, unknown>) =>
        labelOptionValues(entity, Object.fromEntries(Object.keys(prepared.values).map((k) => [k, row[k] ?? null])), options);
      return ok({ zmenena_pole: Object.keys(prepared.values), pred_zmenou: pick(before), po_zmene: pick(after) });
    },
  );
}
