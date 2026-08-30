"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface ColumnOption {
  field: string;
  label: string;
}

/**
 * "Sloupce" v command baru — zaškrtávátka na to, které sloupce se ve view
 * zobrazí. Ukládá se per uživatel do localStorage (klíč `columns:<entita>`),
 * takže je to osobní nastavení pohledu, ne sdílená definice view.
 */
export function ColumnPicker({
  storageKey,
  options,
  visible,
  onChange,
}: {
  storageKey: string;
  options: ColumnOption[];
  visible: string[];
  onChange: (fields: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle(field: string) {
    const next = visible.includes(field) ? visible.filter((f) => f !== field) : [...visible, field];
    onChange(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // soukromé prohlížení apod. — jen se nezapamatuje mezi návštěvami
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground"
      >
        <Columns3 className="size-4" />
        Sloupce
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 space-y-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {options.map((opt) => (
            <label
              key={opt.field}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent"
            >
              <Checkbox checked={visible.includes(opt.field)} onCheckedChange={() => toggle(opt.field)} />
              <Label className="cursor-pointer font-normal">{opt.label}</Label>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
