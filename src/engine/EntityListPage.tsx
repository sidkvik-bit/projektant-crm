import { createClient } from "@/lib/supabase/server";
import { EntityListClient } from "./EntityListClient";
import { PageHeader } from "@/components/shell/PageHeader";
import { importableEntities } from "@/solutions/Projektant_CRM/entities";
import type { EntityDefinition, ViewDefinition } from "./types";

export interface EntityListPageProps {
  entity: EntityDefinition;
  view: ViewDefinition;
  select: string;
  basePath: string;
  /** Vynech, pokud entita nemá mít samostatný "+ Nový" formulář (zakládá se jen kontextově). */
  newLabel?: string;
  /** Umožní řádek doupravit (např. rozbalit vnořený lookup/optionset na label). */
  mapRow?: (row: Record<string, unknown>) => Record<string, unknown>;
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
  view,
  select,
  basePath,
  newLabel,
  mapRow,
  description,
  searchParams,
}: EntityListPageProps) {
  const supabase = await createClient();
  const params = (await searchParams) ?? {};
  const status = params.status ?? "active";

  let query = supabase.from(entity.table).select(select);
  if (status !== "all") {
    query = applyColumnFilter(query, "status", "eq", status);
  }
  if (params.q) {
    query = applyColumnFilter(query, entity.primaryField, "contains", params.q);
  }

  // Filtry na jednotlivých sloupcích (cf_<pole>=<operátor>|<hodnota>) — jen na skutečných
  // sloupcích entity, ne na dopočtených lookup/optionset labelech z GridEngine.
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith("cf_") || !raw) continue;
    const field = key.slice(3);
    if (!entity.fields.some((f) => f.name === field)) continue;
    const [op, ...rest] = raw.split("|");
    if (!op || rest.length === 0) continue;
    query = applyColumnFilter(query, field, op, rest.join("|"));
  }

  const sortField =
    params.sort && entity.fields.some((f) => f.name === params.sort) ? params.sort : view.defaultSort?.field;
  const sortDirection = params.sort ? (params.dir ?? "asc") : (view.defaultSort?.direction ?? "asc");
  if (sortField) {
    query = query.order(sortField, { ascending: sortDirection === "asc" });
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    mapRow ? mapRow(row) : row,
  );

  const isImportable = importableEntities.some((e) => e.name === entity.name);

  return (
    <div>
      <PageHeader title={entity.displayNamePlural} description={description} />
      <EntityListClient
        entity={entity}
        view={view}
        rows={rows}
        basePath={basePath}
        newLabel={newLabel}
        isImportable={isImportable}
      />
    </div>
  );
}
