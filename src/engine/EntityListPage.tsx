import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { GridEngine } from "./GridEngine";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { EntityDefinition, ViewDefinition } from "./types";

export interface EntityListPageProps {
  entity: EntityDefinition;
  view: ViewDefinition;
  select: string;
  basePath: string;
  newLabel: string;
  /** Umožní řádek doupravit (např. rozbalit vnořený lookup/optionset na label). */
  mapRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  description?: string;
}

export async function EntityListPage({
  entity,
  view,
  select,
  basePath,
  newLabel,
  mapRow,
  description,
}: EntityListPageProps) {
  const supabase = await createClient();

  let query = supabase.from(entity.table).select(select);
  if (view.defaultSort) {
    query = query.order(view.defaultSort.field, {
      ascending: view.defaultSort.direction === "asc",
    });
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    mapRow ? mapRow(row) : row,
  );

  return (
    <div>
      <PageHeader
        title={entity.displayNamePlural}
        description={description}
        actions={
          <Button render={<Link href={`${basePath}/new`}><Plus className="size-4" />{newLabel}</Link>} />
        }
      />
      <div className="p-6">
        <GridEngine entity={entity} view={view} rows={rows} basePath={basePath} />
      </div>
    </div>
  );
}
