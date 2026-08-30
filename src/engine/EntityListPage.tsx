import Link from "next/link";
import type { ReactNode } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { GridEngine } from "./GridEngine";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
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
  /** Další tlačítka vedle "+ Nový" / "Import z Excelu". */
  extraActions?: ReactNode;
}

export async function EntityListPage({
  entity,
  view,
  select,
  basePath,
  newLabel,
  mapRow,
  description,
  extraActions,
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

  const isImportable = importableEntities.some((e) => e.name === entity.name);

  return (
    <div>
      <PageHeader
        title={entity.displayNamePlural}
        description={description}
        actions={
          <>
            {extraActions}
            {isImportable && (
              <Button
                variant="outline"
                render={
                  <Link href={`/import?entity=${entity.name}`}>
                    <FileSpreadsheet className="size-4" />
                    Import z Excelu
                  </Link>
                }
              />
            )}
            {newLabel && (
              <Button render={<Link href={`${basePath}/new`}><Plus className="size-4" />{newLabel}</Link>} />
            )}
          </>
        }
      />
      <div className="p-6">
        <GridEngine entity={entity} view={view} rows={rows} basePath={basePath} />
      </div>
    </div>
  );
}
