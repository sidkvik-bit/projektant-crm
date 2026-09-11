import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_TONE_DOT_CLASS, type StatusBreakdownEntry } from "@/engine/statusColor";

export function PageHeader({
  title,
  description,
  badge,
  actions,
  stats,
}: {
  title: string;
  description?: string;
  /** Nejdůležitější info hned vedle názvu — typicky stav záznamu (D365 form header vzor). */
  badge?: { label: string; variant?: "default" | "secondary" | "destructive" };
  actions?: ReactNode;
  /** Počet + segmentovaný pruh podle Důvodu stavu — jen na seznamech (viz EntityListPage). */
  stats?: { total: number; breakdown: StatusBreakdownEntry[] };
}) {
  return (
    <div className="flex flex-col gap-3 border-b bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {badge && <Badge variant={badge.variant ?? "secondary"}>{badge.label}</Badge>}
          {stats && (
            <span className="text-sm text-muted-foreground">
              {stats.total} {stats.total === 1 ? "záznam" : "záznamů"}
            </span>
          )}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {stats && stats.total > 0 && stats.breakdown.length > 1 && (
          <div className="mt-2 flex h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
            {stats.breakdown.map(({ label, count, tone }) => (
              <span
                key={label}
                title={`${label}: ${count}`}
                className={cn("h-full", STATUS_TONE_DOT_CLASS[tone])}
                style={{ width: `${(count / stats.total) * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}
