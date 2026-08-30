import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  /** Nejdůležitější info hned vedle názvu — typicky stav záznamu (D365 form header vzor). */
  badge?: { label: string; variant?: "default" | "secondary" | "destructive" };
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b bg-background px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {badge && <Badge variant={badge.variant ?? "secondary"}>{badge.label}</Badge>}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
