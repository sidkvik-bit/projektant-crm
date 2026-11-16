import { createClient } from "@/lib/supabase/server";
import { EntityListClient } from "./EntityListClient";
import { PageHeader } from "@/components/shell/PageHeader";
import { importableEntities } from "@/solutions/Projektant_CRM/entities";
import { resolveFilterField } from "./columnFields";
import { computeStatusBreakdown } from "./statusColor";
import { getOptionSetValues } from "./optionSets";
import type { EntityDefinition, ViewDefinition } from "./types";
import { getCustomizations } from "@/customization/repository";
import { commandsFor, customFields, effectiveEntity, effectiveViews, scriptsFor, CUSTOM_RECORDS_TABLE } from "@/customization/merge";
import { CUSTOM_COLUMN, dbColumnRef, isCustomFieldName, unfoldCustomValues } from "@/customization/customValues";
import { loadLookupOptions } from "@/customization/fieldOptions";
import { customEntityBasePaths, resolveEntityRef } from "@/customization/registry";

export interface EntityListPageProps {
  entity: EntityDefinition;
  /** První view je výchozí. Přepínání jde přes ?view=<name>, viz EntityListClient. */
  views: ViewDefinition[];
  select: string;
  basePath: string;
  /** Vynech, pokud entita nemá mít samostatný "+ Nový" formulář (zakládá se jen kontextově). */
  newLabel?: string;
  /** Umožní řádek doupravit (např. rozbalit vnořený lookup/optionset na label). */
  mapRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Dávkové dořešení řádků, co potřebuje vlastní dotaz(y) přes všechny řádky najednou
   * (např. Activity.regarding — polymorfní entity_type/entity_id nejde vyřešit jedním joinem).
   * Běží až po `mapRow`, na serveru.
   */
  resolveRows?: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    rows: Record<string, unknown>[],
  ) => Promise<Record<string, unknown>[]>;
  description?: string;
  searchParams?: Promise<Record<string, string | undefined>>;
}

interface FilterableQuery<Q> {
  ilike: (field: string, pattern: string) => Q;
  not: (field: string, op: string, value: string) => Q;
  neq: (field: string, value: string) => Q;
  gt: (field: string, value: string) => Q;
  lt: (field: string, value: string) => Q;
  eq: (field: string, value: string) => Q;
}

function applyColumnFilter<Q extends FilterableQuery<Q>>(query: Q, field: string, op: string, value: string): Q {
  switch (op) {
    case "contains":
      return query.ilike(field, `%${value}%`);
    case "notcontains":
      return query.not(field, "ilike", `%${value}%`);
    case "startswith":
      return query.ilike(field, `${value}%`);
    case "neq":
      return query.neq(field, value);
    case "gt":
    case "after":
      return query.gt(field, value);
    case "lt":
    case "before":
      return query.lt(field, value);
    case "eq":
    default:
      return query.eq(field, value);
  }
}

export async function EntityListPage({
  entity: baseEntity,
  views: baseViews,
  select: baseSelect,
  basePath,
  newLabel,
  mapRow,
  resolveRows,
  description,
  searchParams,
}: EntityListPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};

  // Vrstva úprav firmy: vlastní pole (sloupce, filtry), pohledy navíc/upravené, tlačítka.
  const customizations = await getCustomizations();
  const entity = effectiveEntity(baseEntity, customizations);
  const views = effectiveViews(baseViews, entity, customizations);
  const hasCustomFields = entity.table === CUSTOM_RECORDS_TABLE || customFields(customizations, entity.name).length > 0;
  const select =
    hasCustomFields && !/(^|[\s,])(\*|custom)([\s,]|$)/.test(baseSelect) ? `${baseSelect}, ${CUSTOM_COLUMN}` : baseSelect;
  const view = views.find((v) => v.name === params.view) ?? views[0];

  let query = supabase.from(entity.table).select(select);
  // Vlastní entity sdílí jednu tabulku.
  if (entity.table === CUSTOM_RECORDS_TABLE) query = query.eq("entity_name", entity.name);

  // Každé view nese svoje vlastní podmínky (status, vlastník…) — nic se nekombinuje s
  // odjinud, viz buildStatusViews. Všechny se aplikují zároveň (AND).
  if (view.conditions?.length) {
    let currentUserId: string | null | undefined;
    for (const cond of view.conditions) {
      let value = cond.value;
      if (value === "$currentUser") {
        if (currentUserId === undefined) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          currentUserId = user?.id ?? null;
        }
        value = currentUserId ?? "";
      }
      if (value) query = applyColumnFilter(query, dbColumnRef(cond.field), cond.operator, value);
    }
  }

  if (params.q) {
    query = applyColumnFilter(query, entity.primaryField, "contains", params.q);
  }

  // GridEngine posílá cf_/sort už namapované na skutečný DB sloupec (viz resolveFilterField) —
  // "status_reason_id"/"owner_id" jsou synteticky přidané systémové sloupce, ne přímo v entity.fields.
  const isKnownDbColumn = (field: string) =>
    entity.fields.some((f) => f.name === field) || field === "status_reason_id" || field === "owner_id";

  // Filtry na jednotlivých sloupcích (cf_<pole>=<operátor>|<hodnota>).
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith("cf_") || !raw) continue;
    const field = key.slice(3);
    if (!isKnownDbColumn(field)) continue;
    const [op, ...rest] = raw.split("|");
    if (!op || rest.length === 0) continue;
    query = applyColumnFilter(query, dbColumnRef(field), op, rest.join("|"));
  }

  const sortField =
    params.sort && isKnownDbColumn(params.sort) ? params.sort : view.defaultSort?.field;
  const sortDirection = params.sort ? (params.dir ?? "asc") : (view.defaultSort?.direction ?? "asc");
  if (sortField) {
    query = query.order(dbColumnRef(sortField), { ascending: sortDirection === "asc" });
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const unfolded = unfoldCustomValues(row);
    return mapRow ? mapRow(unfolded) : unfolded;
  });
  if (resolveRows) rows = await resolveRows(supabase, rows);
  rows = await labelCustomChoiceColumns(supabase, rows, entity, view, customizations);

  const isImportable = importableEntities.some((e) => e.name === entity.name);

  // Možnosti pro filtr lookup/optionset sloupců aktivního view (D365 "rovná se konkrétní hodnotě").
  const choiceColumns = view.columns
    .map((c) => resolveFilterField(entity, c.field))
    .filter((r): r is NonNullable<typeof r> => Boolean(r) && (r!.field.type === "lookup" || r!.field.type === "optionset"));

  const fieldOptionsEntries = await Promise.all(
    choiceColumns.map(async ({ dbColumn, field }) => {
      if (field.type === "optionset") {
        const key = dbColumn === "status_reason_id" ? entity.statusReasonOptionSetKey : field.optionSetKey;
        if (!key) return [dbColumn, []] as const;
        const values = await getOptionSetValues(supabase, key);
        return [dbColumn, values.map((v) => ({ value: v.id, label: v.label }))] as const;
      }
      if (!field.targetEntity) return [dbColumn, []] as const;
      const options = await loadLookupOptions(supabase, field.targetEntity, customizations);
      return [dbColumn, options.map((o) => ({ value: o.id, label: o.label }))] as const;
    }),
  );
  const fieldOptions = Object.fromEntries(fieldOptionsEntries);
  const hasStatusReasonColumn = view.columns.some((c) => c.field === "status_reason");

  return (
    <div>
      <PageHeader
        title={entity.displayNamePlural}
        description={description}
        stats={hasStatusReasonColumn ? { total: rows.length, breakdown: computeStatusBreakdown(rows) } : undefined}
      />
      <EntityListClient
        entity={entity}
        view={view}
        views={views}
        rows={rows}
        basePath={basePath}
        newLabel={newLabel}
        isImportable={isImportable}
        fieldOptions={fieldOptions}
        customization={{
          entity: entity.name,
          commands: commandsFor(entity.name, "list", customizations),
          scripts: scriptsFor(entity.name, customizations),
          basePaths: customEntityBasePaths(customizations),
        }}
      />
    </div>
  );
}

/**
 * Vlastní pole typu číselník/lookup mají v řádku jen id — pro zobrazení v gridu je nahradí
 * popiskem (sloupce základních entit si to řeší embedem v `select` a mapRow na stránce).
 */
async function labelCustomChoiceColumns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Record<string, unknown>[],
  entity: EntityDefinition,
  view: ViewDefinition,
  customizations: Awaited<ReturnType<typeof getCustomizations>>,
) {
  const choiceFields = entity.fields.filter(
    (f) =>
      isCustomFieldName(f.name) &&
      (f.type === "optionset" || f.type === "lookup") &&
      view.columns.some((c) => c.field === f.name),
  );
  if (choiceFields.length === 0 || rows.length === 0) return rows;

  const labels = await Promise.all(
    choiceFields.map(async (f) => {
      if (f.type === "optionset" && f.optionSetKey) {
        const values = await getOptionSetValues(supabase, f.optionSetKey);
        return new Map(values.map((v) => [v.id, v.label]));
      }
      if (f.type === "lookup" && f.targetEntity && resolveEntityRef(f.targetEntity, customizations)) {
        const options = await loadLookupOptions(supabase, f.targetEntity, customizations);
        return new Map(options.map((o) => [o.id, o.label]));
      }
      return new Map<string, string>();
    }),
  );

  return rows.map((row) => {
    const next = { ...row };
    choiceFields.forEach((f, i) => {
      const id = row[f.name];
      if (typeof id === "string") next[f.name] = labels[i].get(id) ?? id;
    });
    return next;
  });
}
