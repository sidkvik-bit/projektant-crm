"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { Building2, Loader2 } from "lucide-react";
import type { AresMatch } from "@/lib/ares";
import type { EntityFormValues } from "@/engine/zodSchema";
import type { OptionSetValue } from "@/engine/optionSets";

/** Kolik ms po `pick()` se search ignoruje na SESTERSKÉM poli (Název i IČO obojí sdílí
 * `lastPickAtRef` — vybrání na jednom pole programově přepíše i to druhé, což by bez
 * tohohle okna hned znovu otevřelo jeho vlastní dropdown). */
const SUPPRESS_AFTER_PICK_MS = 1000;

/**
 * Vyhledávání v ARES napojené na jedno pole formuláře (Název, nebo IČO) — jak uživatel píše,
 * pod polem se objeví nalezené firmy; klikem se předvyplní Název/IČO/sídlo/právní forma, ale
 * formulář se NEUKLÁDÁ (jen `setValue(..., { shouldDirty: true })` — uloží se běžným Uložit).
 *
 * Nesmí se spustit hned po načtení existujícího záznamu (watch by jinak okamžitě viděl už
 * vyplněnou hodnotu) — proto čeká na první skutečnou změnu hodnoty pole od mountu.
 */
export function AresCompanyLookup({
  control,
  setValue,
  watchField,
  mode,
  legalFormOptions = [],
  suppressSearchRef,
}: {
  control: Control<EntityFormValues>;
  setValue: UseFormSetValue<EntityFormValues>;
  watchField: string;
  mode: "name" | "ico";
  /** option_set_values pro 'pravni_forma' — mapuje ARES kód (value_key) na naše UUID. */
  legalFormOptions?: OptionSetValue[];
  /** Sdílený mezi Název/IČO instancemi (FormEngine drží jeden ref pro obě) — viz SUPPRESS_AFTER_PICK_MS. */
  suppressSearchRef: MutableRefObject<boolean>;
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
    if (suppressSearchRef.current) return;

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
  }, [rawValue, mode, dismissedFor, suppressSearchRef]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(match: AresMatch) {
    suppressSearchRef.current = true;
    setTimeout(() => {
      suppressSearchRef.current = false;
    }, SUPPRESS_AFTER_PICK_MS);
    setValue("name", match.name, { shouldDirty: true });
    setValue("ico", match.ico, { shouldDirty: true });
    if (match.street) setValue("address_street", match.street, { shouldDirty: true });
    if (match.houseNumber) setValue("address_house_number", match.houseNumber, { shouldDirty: true });
    if (match.city) setValue("address_city", match.city, { shouldDirty: true });
    if (match.zip) setValue("address_zip", match.zip, { shouldDirty: true });
    if (match.country) setValue("address_country", match.country, { shouldDirty: true });
    if (match.legalFormCode) {
      const option = legalFormOptions.find((o) => o.value_key === match.legalFormCode);
      if (option) setValue("pravni_forma_id", option.id, { shouldDirty: true });
    }
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
