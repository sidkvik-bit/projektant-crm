"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Target,
  Building2,
  Users,
  FolderKanban,
  Receipt,
  Banknote,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxIcon,
  ComboboxContent,
  ComboboxItem,
} from "@/components/ui/combobox";
import { createClient } from "@/lib/supabase/client";

interface SearchResult {
  entity: string;
  id: string;
  title: string;
  subtitle: string;
  rank: number;
}

const ENTITY_META: Record<string, { label: string; icon: LucideIcon; basePath: string }> = {
  Lead: { label: "Zájemce", icon: Target, basePath: "/leads" },
  Account: { label: "Firma", icon: Building2, basePath: "/accounts" },
  Contact: { label: "Kontakt", icon: Users, basePath: "/contacts" },
  Project: { label: "Projekt", icon: FolderKanban, basePath: "/projects" },
  Quote: { label: "Nabídka", icon: Receipt, basePath: "/quotes" },
  Invoice: { label: "Faktura", icon: Banknote, basePath: "/invoices" },
  Activity: { label: "Aktivita", icon: ActivityIcon, basePath: "/activities" },
};

/** Globální fulltextový search přes celou appku — Ctrl/Cmd+K ho zaostří. Volá se přímo z
 * klienta (stejně jako ProjectLocationMap.tsx hledání míst) — RLS chrání výsledky stejně,
 * ať se dotaz spustí odsud nebo přes server action. */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleInputValueChange(value: string) {
    setQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("global_search", { q: value.trim(), result_limit: 20 });
        setResults((data as SearchResult[] | null) ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleSelect(result: SearchResult | null) {
    if (!result) return;
    const meta = ENTITY_META[result.entity];
    if (!meta) return;
    setQuery("");
    setResults([]);
    router.push(`${meta.basePath}/${result.id}`);
  }

  return (
    <Combobox
      items={results}
      filter={null}
      itemToStringLabel={(item: SearchResult) => item.title}
      onValueChange={(item) => handleSelect(item as SearchResult | null)}
      onInputValueChange={handleInputValueChange}
    >
      <ComboboxInputGroup className="w-full max-w-md">
        <ComboboxIcon />
        <ComboboxInput
          ref={inputRef}
          placeholder="Hledat v CRM… (Ctrl+K)"
          className="pr-10"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          Ctrl+K
        </kbd>
      </ComboboxInputGroup>
      <ComboboxContent emptyLabel={searching ? "Hledám…" : query.trim().length < 2 ? "Napiš aspoň 2 znaky…" : "Nic nenalezeno"}>
        {(item: SearchResult) => {
          const meta = ENTITY_META[item.entity];
          const Icon = meta?.icon ?? Search;
          return (
            <ComboboxItem key={`${item.entity}:${item.id}`} value={item} className="gap-2.5">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {meta?.label ?? item.entity}
              </span>
            </ComboboxItem>
          );
        }}
      </ComboboxContent>
    </Combobox>
  );
}
