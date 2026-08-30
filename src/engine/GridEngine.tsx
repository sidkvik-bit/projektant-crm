"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { EntityDefinition, ViewDefinition, FieldDefinition } from "./types";

const STATUS_FIELD: FieldDefinition = { name: "status", label: "Stav", type: "optionset" };
const STATUS_REASON_FIELD: FieldDefinition = {
  name: "status_reason",
  label: "Důvod stavu",
  type: "optionset",
};
const OWNER_FIELD: FieldDefinition = { name: "owner", label: "Vlastník", type: "lookup" };

function resolveColumnField(entity: EntityDefinition, name: string): FieldDefinition {
  if (name === "status") return STATUS_FIELD;
  if (name === "status_reason" || name === "status_reason_id") return STATUS_REASON_FIELD;
  if (name === "owner" || name === "owner_id") return OWNER_FIELD;
  return entity.fields.find((f) => f.name === name) ?? { name, label: name, type: "text" };
}

function formatValue(field: FieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";

  if (field.name === "status") {
    return (
      <Badge variant={value === "active" ? "default" : "secondary"}>
        {value === "active" ? "Aktivní" : "Neaktivní"}
      </Badge>
    );
  }

  if (field.type === "boolean") {
    return value ? "Ano" : "Ne";
  }

  if (field.type === "date" || field.type === "datetime") {
    return new Date(String(value)).toLocaleDateString("cs-CZ");
  }

  if (field.type === "currency") {
    return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(
      Number(value),
    );
  }

  return String(value);
}

export interface GridEngineProps<T extends Record<string, unknown>> {
  entity: EntityDefinition;
  view: ViewDefinition;
  rows: T[];
  /** Řádky mají už vyřešené zobrazovací hodnoty (label místo id) pro lookup/optionset sloupce. */
  /** Když je zadané, primaryField sloupec se odkazuje na `${basePath}/${row.id}`. */
  basePath?: string;
  emptyLabel?: string;
}

export function GridEngine<T extends Record<string, unknown>>({
  entity,
  view,
  rows,
  basePath,
  emptyLabel = "Žádné záznamy",
}: GridEngineProps<T>) {
  const router = useRouter();
  const columns = view.columns.map((col) => ({
    ...col,
    field: resolveColumnField(entity, col.field),
  }));

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col.field.name} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {col.label ?? col.field.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => {
              const href = basePath ? `${basePath}/${row.id}` : undefined;
              return (
                <TableRow
                  key={(row.id as string) ?? i}
                  className={cn(
                    "transition-colors hover:bg-accent/40",
                    href && "cursor-pointer",
                  )}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  {columns.map((col) => {
                    const value = formatValue(col.field, row[col.field.name]);
                    const isPrimary = col.field.name === entity.primaryField;
                    return (
                      <TableCell key={col.field.name}>
                        {isPrimary && href ? (
                          <Link
                            href={href}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {value}
                          </Link>
                        ) : (
                          value
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
