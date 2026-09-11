import { createClient } from "@/lib/supabase/server";
import { EntityListClient } from "./EntityListClient";
import { PageHeader } from "@/components/shell/PageHeader";
import { importableEntities } from "@/solutions/Projektant_CRM/entities";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import { resolveFilterField } from "./columnFields";
import { computeStatusBreakdown } from "./statusColor";
import { getOptionSetValues } from "./optionSets";
import type { EntityDefinition, ViewDefinition } from "./types";

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
  entity,
  views,
  select,
  basePath,
  newLabel,
  mapRow,
  resolveRows,
  description,
  searchParams,
}: EntityListPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};
  const view = views.find((v) => v.name === params.view) ?? views[0];

  let query = supabase.from(entity.table).select(select);

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
      if (value) query = applyColumnFilter(query, cond.field, cond.operator, value);
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
    query = applyColumnFilter(query, field, op, rest.join("|"));
  }

  const sortField =
    params.sort && isKnownDbColumn(params.sort) ? params.sort : view.defaultSort?.field;
  const sortDirection = params.sort ? (params.dir ?? "asc") : (view.defaultSort?.direction ?? "asc");
  if (sortField) {
    query = query.order(sortField, { ascending: sortDirection === "asc" });
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    mapRow ? mapRow(row) : row,
  );
  if (resolveRows) rows = await resolveRows(supabase, rows);

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
      const reg = field.targetEntity === "User" ? { table: "users", labelFields: ["first_name", "last_name"] } : field.targetEntity ? entityRegistry[field.targetEntity] : null;
      if (!reg) return [dbColumn, []] as const;
      const { data: optRows } = await supabase.from(reg.table).select(`id, ${reg.labelFields.join(", ")}`);
      const options = ((optRows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        value: r.id as string,
        label: reg.labelFields.map((lf) => r[lf]).filter(Boolean).join(" ") || "—",
      }));
      return [dbColumn, options] as const;
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
      />
    </div>
  );
}
