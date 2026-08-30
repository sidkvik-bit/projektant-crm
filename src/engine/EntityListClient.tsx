"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, FileSpreadsheet, Trash2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CommandBar, CommandBarButton, CommandBarSeparator } from "@/components/shell/CommandBar";
import { GridEngine } from "./GridEngine";
import type { ColumnFilter } from "./ColumnFilterPopover";
import { bulkDeleteEntityRecords } from "./entityActions";
import type { EntityDefinition, ViewDefinition } from "./types";

const COLUMN_FILTER_PREFIX = "cf_";

function parseColumnFilters(searchParams: URLSearchParams): Record<string, ColumnFilter> {
  const filters: Record<string, ColumnFilter> = {};
  for (const [key, raw] of searchParams.entries()) {
    if (!key.startsWith(COLUMN_FILTER_PREFIX)) continue;
    const [op, ...rest] = raw.split("|");
    if (!op || rest.length === 0) continue;
    filters[key.slice(COLUMN_FILTER_PREFIX.length)] = { op, value: rest.join("|") };
  }
  return filters;
}

const STATUS_FILTERS = [
  { value: "active", label: "Aktivní" },
  { value: "inactive", label: "Neaktivní" },
  { value: "all", label: "Vše" },
] as const;

export function EntityListClient({
  entity,
  view,
  rows,
  basePath,
  newLabel,
  isImportable,
  hasStatusFilter = true,
}: {
  entity: EntityDefinition;
  view: ViewDefinition;
  rows: Record<string, unknown>[];
  basePath: string;
  newLabel?: string;
  isImportable: boolean;
  /** Vypni pro entity bez status sloupce (žádná v aplikaci teď, ale ať to jde). */
  hasStatusFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "active";
  const columnFilters = parseColumnFilters(searchParams);
  const sortField = searchParams.get("sort");
  const sortDirection = searchParams.get("dir") as "asc" | "desc" | null;
  const sort = sortField && sortDirection ? { field: sortField, direction: sortDirection } : null;

  function updateParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function handleSortChange(field: string, direction: "asc" | "desc") {
    updateParams({ sort: field, dir: direction });
  }

  function handleFilterChange(field: string, filter: ColumnFilter | null) {
    updateParams({ [`${COLUMN_FILTER_PREFIX}${field}`]: filter ? `${filter.op}|${filter.value}` : null });
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id as string)),
    );
  }

  async function confirmBulkDelete() {
    setDeleteBusy(true);
    try {
      await bulkDeleteEntityRecords(entity.table, basePath, Array.from(selectedIds));
      setSelectedIds(new Set());
      setDeleteOpen(false);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <div>
      <CommandBar>
        {newLabel && <CommandBarButton icon={Plus} label={newLabel} href={`${basePath}/new`} />}
        {isImportable && (
          <CommandBarButton icon={FileSpreadsheet} label="Import z Excelu" href={`/import?entity=${entity.name}`} />
        )}
        <CommandBarSeparator />
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-foreground/80 hover:text-foreground"
                disabled={selectedCount === 0}
              >
                <Trash2 className="size-4" />
                Odstranit{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Odstranit {selectedCount} {selectedCount === 1 ? "záznam" : "záznamů"}?</DialogTitle>
              <DialogDescription>
                Tuhle akci nejde vzít zpět. Pokud jde jen o to záznamy přestat používat, deaktivuj je
                místo toho v detailu.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                Zrušit
              </Button>
              <Button variant="destructive" onClick={confirmBulkDelete} disabled={deleteBusy}>
                {deleteBusy ? "Odstraňuji…" : "Odstranit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <CommandBarButton icon={RefreshCw} label="Aktualizovat" onClick={() => router.refresh()} />
        <CommandBarSeparator />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParams({ q });
            }}
            onBlur={() => updateParams({ q })}
            placeholder={`Hledat v poli "${entity.fields.find((f) => f.name === entity.primaryField)?.label ?? entity.primaryField}"…`}
            className="h-8 w-64 pl-7"
          />
        </div>

        {hasStatusFilter && (
          <div className="ml-auto flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <Badge
                key={f.value}
                variant={status === f.value ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => updateParams({ status: f.value === "active" ? null : f.value })}
              >
                {f.label}
              </Badge>
            ))}
          </div>
        )}
      </CommandBar>
      <div className="p-6">
        <GridEngine
          entity={entity}
          view={view}
          rows={rows}
          basePath={basePath}
          selection={{ selectedIds, onToggleRow: toggleRow, onToggleAll: toggleAll }}
          columnControls={{
            sort,
            onSortChange: handleSortChange,
            filters: columnFilters,
            onFilterChange: handleFilterChange,
          }}
        />
      </div>
    </div>
  );
}
