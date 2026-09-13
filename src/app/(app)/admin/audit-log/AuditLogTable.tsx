"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AuditLogRow {
  id: string;
  tableName: string;
  recordId: string | null;
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: string;
  organizationName: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Vytvořeno",
  UPDATE: "Změněno",
  DELETE: "Smazáno",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

/** U UPDATE zajímá hlavně to, co se reálně změnilo — ne celý řádek (ten má klidně 20 sloupců,
 * z nichž se změnil jeden). Systémová pole se schovávají, ta se mění při každém zápisu. */
const NOISY_FIELDS = new Set(["updated_at", "modified_by", "created_at", "created_by", "search_vector"]);

function changedFields(oldValues: Record<string, unknown> | null, newValues: Record<string, unknown> | null) {
  if (!oldValues || !newValues) return null;
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const key of keys) {
    if (NOISY_FIELDS.has(key)) continue;
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changes.push({ field: key, from: oldValues[key], to: newValues[key] });
    }
  }
  return changes;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditLogTable({
  logs,
  activeTable,
  activeAction,
}: {
  logs: AuditLogRow[];
  activeTable: string | null;
  activeAction: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  const tables = Array.from(new Set(logs.map((log) => log.tableName))).sort();

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `/admin/audit-log?${qs}` : "/admin/audit-log");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeTable ?? ""}
          onChange={(e) => setFilter("table", e.target.value || null)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="">Všechny tabulky</option>
          {tables.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))}
        </select>
        <select
          value={activeAction ?? ""}
          onChange={(e) => setFilter("action", e.target.value || null)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="">Všechny akce</option>
          <option value="INSERT">Vytvořeno</option>
          <option value="UPDATE">Změněno</option>
          <option value="DELETE">Smazáno</option>
        </select>
        {(activeTable || activeAction) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/audit-log")}
          >
            Zrušit filtry
          </Button>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Žádné záznamy neodpovídají filtru.
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {logs.map((log) => {
            const changes = changedFields(log.oldValues, log.newValues);
            const isOpen = expanded === log.id;
            return (
              <div key={log.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <Badge variant={ACTION_VARIANTS[log.action] ?? "secondary"} className="shrink-0">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{log.tableName}</span>
                    {changes && changes.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {changes.map((c) => c.field).join(", ")}
                      </span>
                    )}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {log.organizationName} · {log.changedBy}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("cs-CZ")}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t bg-muted/20 px-3 py-3 text-xs">
                    <p className="text-muted-foreground">
                      Organizace: <span className="text-foreground">{log.organizationName}</span> · Změnil/a:{" "}
                      <span className="text-foreground">{log.changedBy}</span> · ID záznamu:{" "}
                      <span className="font-mono text-foreground">{log.recordId ?? "—"}</span>
                    </p>
                    {changes === null ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-background p-2">
                        {JSON.stringify(log.newValues ?? log.oldValues, null, 2)}
                      </pre>
                    ) : changes.length === 0 ? (
                      <p className="text-muted-foreground">Změnila se jen systémová pole.</p>
                    ) : (
                      <div className="space-y-1">
                        {changes.map((change) => (
                          <div key={change.field} className="flex flex-wrap gap-x-2">
                            <span className="font-medium text-foreground">{change.field}:</span>
                            <span className={cn("text-muted-foreground line-through")}>{formatValue(change.from)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-foreground">{formatValue(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
