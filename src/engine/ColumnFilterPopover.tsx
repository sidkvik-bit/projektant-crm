"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FieldType } from "./types";

export interface ColumnFilter {
  op: string;
  value: string;
}

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "Obsahuje" },
    { value: "notcontains", label: "Neobsahuje" },
    { value: "eq", label: "Je rovno" },
    { value: "startswith", label: "Začíná na" },
  ],
  number: [
    { value: "eq", label: "Je rovno" },
    { value: "neq", label: "Není rovno" },
    { value: "gt", label: "Větší než" },
    { value: "lt", label: "Menší než" },
  ],
  date: [
    { value: "eq", label: "Je rovno" },
    { value: "after", label: "Po" },
    { value: "before", label: "Před" },
  ],
  boolean: [{ value: "eq", label: "Je rovno" }],
};

function operatorsFor(type: FieldType): { value: string; label: string }[] | null {
  if (["text", "textarea", "email", "phone", "url"].includes(type)) return OPERATORS_BY_TYPE.text;
  if (["number", "currency"].includes(type)) return OPERATORS_BY_TYPE.number;
  if (["date", "datetime"].includes(type)) return OPERATORS_BY_TYPE.date;
  if (type === "boolean") return OPERATORS_BY_TYPE.boolean;
  return null; // lookup/optionset — zatím bez filtru (potřebuje seznam možností per sloupec)
}

export function ColumnFilterPopover({
  label,
  fieldType,
  sortDirection,
  onSort,
  filter,
  onFilterChange,
}: {
  label: string;
  fieldType: FieldType;
  sortDirection: "asc" | "desc" | null;
  onSort: (direction: "asc" | "desc") => void;
  filter: ColumnFilter | null;
  onFilterChange: (filter: ColumnFilter | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const operators = operatorsFor(fieldType);
  const [op, setOp] = useState(filter?.op ?? operators?.[0]?.value ?? "contains");
  const [value, setValue] = useState(filter?.value ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {label}
        {filter && <Filter className="size-3 text-primary" />}
        {sortDirection === "asc" && <ArrowUp className="size-3" />}
        {sortDirection === "desc" && <ArrowDown className="size-3" />}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 space-y-2 rounded-lg border bg-popover p-2 normal-case text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="flex gap-1">
            <Button
              variant={sortDirection === "asc" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 gap-1"
              onClick={() => {
                onSort("asc");
                setOpen(false);
              }}
            >
              <ArrowUp className="size-3.5" />
              Od A do Z
            </Button>
            <Button
              variant={sortDirection === "desc" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 gap-1"
              onClick={() => {
                onSort("desc");
                setOpen(false);
              }}
            >
              <ArrowDown className="size-3.5" />
              Od Z do A
            </Button>
          </div>

          {operators && (
            <div className={cn("space-y-1.5 border-t pt-2")}>
              <Select items={Object.fromEntries(operators.map((o) => [o.value, o.label]))} value={op} onValueChange={(v) => setOp(v ?? operators[0].value)}>
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs"
                type={fieldType === "date" || fieldType === "datetime" ? "date" : fieldType === "number" || fieldType === "currency" ? "number" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Hodnota…"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    if (value) onFilterChange({ op, value });
                    setOpen(false);
                  }}
                >
                  Použít
                </Button>
                {filter && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => {
                      onFilterChange(null);
                      setValue("");
                      setOpen(false);
                    }}
                  >
                    Zrušit
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
