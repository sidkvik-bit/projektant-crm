"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { List, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandBarButton } from "@/components/shell/CommandBar";

export interface NavigatorRecord {
  id: string;
  label: string;
}

/**
 * Tlačítko v command baru, které po kliknutí otevře seznam záznamů z view
 * (odkud se na tenhle detail přišlo) jako flyout panel — dá se proklikávat
 * mezi záznamy bez návratu na seznam. Zavřené nezabírá žádné místo (jen
 * samotné tlačítko v command baru), na rozdíl od trvale zobrazeného panelu.
 */
export function RecordNavigator({
  basePath,
  currentId,
  records,
  viewLabel,
}: {
  basePath: string;
  currentId: string;
  records: NavigatorRecord[];
  viewLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CommandBarButton
        icon={List}
        label="Seznam záznamů"
        onClick={() => setOpen(true)}
        title="Zobrazit seznam záznamů z tohoto pohledu"
      />
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40"
            style={{ top: "3.5rem", left: "16rem" }}
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-black/20" />
            <div
              className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-background shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
                <p className="truncate text-sm font-medium">{viewLabel}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {records.map((r) => (
                  <Link
                    key={r.id}
                    href={`${basePath}/${r.id}`}
                    onClick={() => setOpen(false)}
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
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
