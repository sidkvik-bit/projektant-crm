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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilterPopover, type ColumnFilter } from "./ColumnFilterPopover";
import { resolveFilterField } from "./columnFields";
import { resolveStatusTone, computeStatusBreakdown, STATUS_TONE_DOT_CLASS } from "./statusColor";

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

function StatusDot({ label, tone }: { label: string; tone: keyof typeof STATUS_TONE_DOT_CLASS }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", STATUS_TONE_DOT_CLASS[tone])} />
      {label}
    </span>
  );
}

function initialsFromName(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function formatValue(field: FieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";

  if (field.name === "status") {
    return <StatusDot label={value === "active" ? "Aktivní" : "Neaktivní"} tone={value === "active" ? "success" : "neutral"} />;
  }

  if (field.name === "status_reason") {
    return <StatusDot label={String(value)} tone={resolveStatusTone(String(value))} />;
  }

  if (field.name === "owner") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
          {initialsFromName(String(value))}
        </span>
        {String(value)}
      </span>
    );
  }

  if (field.type === "boolean") {
    return value ? "Ano" : "Ne";
  }

  if (field.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(value)} alt="" className="h-8 w-8 rounded object-cover" />;
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
  /** Zaškrtávátka pro hromadné akce (D365 vzor) — vynech, pokud grid selekci nepotřebuje. */
  selection?: {
    selectedIds: Set<string>;
    onToggleRow: (id: string) => void;
    onToggleAll: () => void;
  };
  /** Řazení + filtry na hlavičkách sloupců (D365 vzor) — vynech pro read-only/vnořené gridy. */
  columnControls?: {
    sort: { field: string; direction: "asc" | "desc" } | null;
    onSortChange: (field: string, direction: "asc" | "desc") => void;
    filters: Record<string, ColumnFilter>;
    onFilterChange: (field: string, filter: ColumnFilter | null) => void;
    /** Možnosti pro lookup/optionset filtry (D365 "rovná se" na konkrétní hodnotu), klíč = skutečný DB sloupec. */
    fieldOptions?: Record<string, { value: string; label: string }[]>;
  };
}

export function GridEngine<T extends Record<string, unknown>>({
  entity,
  view,
  rows,
  basePath,
  emptyLabel = "Žádné záznamy",
  selection,
  columnControls,
}: GridEngineProps<T>) {
  const router = useRouter();
  const columns = view.columns.map((col) => {
    const filterable = resolveFilterField(entity, col.field);
    return {
      ...col,
      field: resolveColumnField(entity, col.field),
      // Filtr/řazení jde na skutečný DB sloupec za dopočteným aliasem (account -> account_id atd.),
      // ne na text zobrazený v gridu — viz resolveFilterField.
      isFilterable: Boolean(filterable),
      filterDbColumn: filterable?.dbColumn ?? null,
      filterFieldType: filterable?.field.type ?? null,
    };
  });
  const colSpan = columns.length + (selection ? 1 : 0);
  const allSelected = selection ? rows.length > 0 && rows.every((r) => selection.selectedIds.has(r.id as string)) : false;

  // Souhrnný řádek dole (D365/Orbit vzor) — rozpad podle "Důvod stavu", jen když ho grid
  // vůbec zobrazuje (jinak by "Bez stavu: N" matlo, protože sloupec ani není vidět).
  const hasStatusReasonColumn = columns.some((c) => c.field.name === "status_reason");
  const statusReasonBreakdown = hasStatusReasonColumn ? computeStatusBreakdown(rows) : [];

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection && (
              <TableHead className="w-8">
                <Checkbox checked={allSelected} onCheckedChange={() => selection.onToggleAll()} />
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead key={col.field.name} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {columnControls && col.isFilterable && col.filterDbColumn && col.filterFieldType ? (
                  <ColumnFilterPopover
                    label={col.label ?? col.field.label}
                    fieldType={col.filterFieldType}
                    sortDirection={columnControls.sort?.field === col.filterDbColumn ? columnControls.sort.direction : null}
                    onSort={(dir) => columnControls.onSortChange(col.filterDbColumn as string, dir)}
                    filter={columnControls.filters[col.filterDbColumn] ?? null}
                    onFilterChange={(f) => columnControls.onFilterChange(col.filterDbColumn as string, f)}
                    options={columnControls.fieldOptions?.[col.filterDbColumn]}
                  />
                ) : (
                  col.label ?? col.field.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => {
              const href = basePath ? `${basePath}/${row.id}` : undefined;
              const rowId = row.id as string;
              return (
                <TableRow
                  key={rowId ?? i}
                  className={cn(
                    "transition-colors hover:bg-accent/40",
                    href && "cursor-pointer",
                  )}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  {selection && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.selectedIds.has(rowId)}
                        onCheckedChange={() => selection.onToggleRow(rowId)}
                      />
                    </TableCell>
                  )}
                  {columns.map((col) => {
                    const value = formatValue(col.field, row[col.field.name]);
                    const isPrimary = col.field.name === entity.primaryField;
                    // Dopočtený odkaz na navázaný záznam (např. Activity "Vztahuje se k") — viz mapRow,
                    // které vedle "regarding" naplní i "regarding_href".
                    const computedHref = row[`${col.field.name}_href`] as string | null | undefined;
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
                        ) : computedHref ? (
                          <Link
                            href={computedHref}
                            className="hover:text-primary hover:underline"
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{rows.length}</span>{" "}
          {rows.length === 1 ? "zobrazený záznam" : "zobrazených záznamů"}
        </span>
        {statusReasonBreakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {statusReasonBreakdown.map(({ label, count, tone }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", STATUS_TONE_DOT_CLASS[tone])} />
                {label} <span className="font-medium text-foreground">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
