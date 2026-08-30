"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavigatorRecord {
  id: string;
  label: string;
}

/**
 * Boční panel na detailu záznamu — ukazuje seznam záznamů z view, ze které se
 * na tenhle detail přišlo, takže se dá proklikávat mezi záznamy bez návratu
 * na seznam (PowerApps model-driven "record set navigator").
 */
export function RecordNavigator({
  basePath,
  currentId,
  records,
  viewLabel,
  storageKey,
}: {
  basePath: string;
  currentId: string;
  records: NavigatorRecord[];
  viewLabel: string;
  storageKey: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Reads client-only sessionStorage after mount to avoid an SSR/hydration mismatch
    // (server always renders `open`'s default; this reconciles it once we're on the client).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(sessionStorage.getItem(storageKey) !== "closed");
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      sessionStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // soukromé prohlížení apod. — jen se nezapamatuje stav mezi stránkami
    }
  }

  return (
    <div className={cn("flex shrink-0 border-r bg-muted/20", open ? "w-64" : "w-10")}>
      <div className="flex w-full flex-col">
        <button
          type="button"
          onClick={toggle}
          title={open ? "Skrýt seznam záznamů" : "Zobrazit seznam záznamů"}
          className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5 text-muted-foreground hover:text-foreground"
        >
          {open ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          {open && <span className="truncate text-xs font-medium">{viewLabel}</span>}
        </button>

        {open && (
          <div className="flex-1 overflow-y-auto py-1">
            {records.map((r) => (
              <Link
                key={r.id}
                href={`${basePath}/${r.id}`}
                className={cn(
                  "block truncate px-3 py-1.5 text-sm transition-colors",
                  r.id === currentId
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {r.label || "—"}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
