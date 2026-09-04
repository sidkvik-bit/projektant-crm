"use client";

import { useEffect, useRef, useState } from "react";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { Building2, Loader2 } from "lucide-react";
import type { AresMatch } from "@/lib/ares";
import type { EntityFormValues } from "@/engine/zodSchema";

/**
 * Vyhledávání v ARES napojené na jedno pole formuláře (Název, nebo IČO) — jak uživatel píše,
 * pod polem se objeví nalezené firmy; klikem se předvyplní Název/IČO/Fakturační adresa,
 * ale formulář se NEUKLÁDÁ (jen `setValue(..., { shouldDirty: true })` — uloží se běžným Uložit).
 *
 * Nesmí se spustit hned po načtení existujícího záznamu (watch by jinak okamžitě viděl už
 * vyplněnou hodnotu) — proto čeká na první skutečnou změnu hodnoty pole od mountu.
 */
export function AresCompanyLookup({
  control,
  setValue,
  watchField,
  mode,
}: {
  control: Control<EntityFormValues>;
  setValue: UseFormSetValue<EntityFormValues>;
  watchField: string;
  mode: "name" | "ico";
}) {
  const rawValue = useWatch({ control, name: watchField }) as string | undefined;
  const mountValueRef = useRef(rawValue);
  const touchedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [matches, setMatches] = useState<AresMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    if (rawValue !== mountValueRef.current) touchedRef.current = true;
  }, [rawValue]);

  useEffect(() => {
    if (!touchedRef.current) return;

    const value = (rawValue ?? "").trim();
    if (dismissedFor === value) return;

    const query = mode === "ico" ? value.replace(/\s+/g, "") : value;
    const minLength = mode === "ico" ? 8 : 3;
    if (query.length < minLength || (mode === "ico" && !/^\d{8}$/.test(query))) {
      // Clearing stale results as the watched field shrinks below the search threshold —
      // not synchronizing external state, so a direct setState here is fine.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatches([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ares/search?mode=${mode}&q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { matches: AresMatch[] };
        setMatches(data.matches);
        setOpen(data.matches.length > 0);
      } catch {
        setMatches([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [rawValue, mode, dismissedFor]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(match: AresMatch) {
    setValue("name", match.name, { shouldDirty: true });
    setValue("ico", match.ico, { shouldDirty: true });
    if (match.address) setValue("billing_address", match.address, { shouldDirty: true });
    setOpen(false);
    setDismissedFor(mode === "ico" ? match.ico : match.name);
  }

  if (!loading && !open) return null;

  return (
    <div ref={containerRef} className="relative">
      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Hledám v ARES…
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto py-1">
            {matches.map((match) => (
              <button
                key={match.ico}
                type="button"
                onClick={() => pick(match)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
              >
                <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{match.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    IČO {match.ico}
                    {match.address ? ` · ${match.address}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
