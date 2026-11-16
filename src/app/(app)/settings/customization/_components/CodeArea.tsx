"use client";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Textové pole na kód/JSON — neproporcionální písmo, Tab vloží mezery místo skoku z pole. */
export function CodeArea({
  value,
  onChange,
  rows = 18,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <Textarea
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      spellCheck={false}
      className={cn("font-mono text-xs leading-relaxed", className)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Tab" || e.shiftKey) return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart, selectionEnd } = el;
        const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        onChange(next);
        requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
      }}
    />
  );
}
