"use client";

import { useEffect, useState } from "react";
import { LandPlot, Loader2 } from "lucide-react";
import type { ParcelMatch } from "@/lib/ruianParcels";
import { PARCEL_QUERY_PATTERN } from "@/lib/ruianParcels";

const DEBOUNCE_MS = 350;

const KIND_LABEL: Record<ParcelMatch["druh"], string> = {
  stavebni: "Stavební",
  pozemkova: "Pozemková",
};

/** Výměra se v katastru vede na dvě desetinná místa, ale celá čísla jsou naprostá většina. */
function formatArea(m2: number | null): string | null {
  if (m2 === null) return null;
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(m2)} m²`;
}

/**
 * Našeptávání parcel z katastru pod polem "Parcelní číslo" v panelu parcel. Hledá se až když je
 * vyplněné katastrální území — samotné číslo existuje v tisících území a nabídka by nedávala smysl.
 *
 * Výběrem se doplní i druh, který jinak uživatel hádá: v jednom území může existovat parcela
 * téhož čísla jako stavební i jako pozemková a liší se jen výměrou.
 */
export function RuianParcelLookup({
  katastralniUzemi,
  cisloParcely,
  onPick,
}: {
  katastralniUzemi: string;
  cisloParcely: string;
  onPick: (parcel: ParcelMatch) => void;
}) {
  const [matches, setMatches] = useState<ParcelMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ku = katastralniUzemi.trim();
  const cislo = cisloParcely.trim();
  const searchable = ku.length >= 2 && PARCEL_QUERY_PATTERN.test(cislo);

  useEffect(() => {
    if (!searchable) {
      // Úklid staré nabídky, když dotaz přestane dávat smysl — ne synchronizace vnějšího stavu.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatches([]);
      setError(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/ruian/parcel?ku=${encodeURIComponent(ku)}&q=${encodeURIComponent(cislo)}`,
        );
        const data = (await res.json()) as { parcels: ParcelMatch[]; error?: string };
        setMatches(data.parcels ?? []);
        setError(data.error ?? null);
      } catch {
        setMatches([]);
        setError("Katastr nemovitostí je momentálně nedostupný.");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ku, cislo, searchable]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!searchable) return null;
  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Hledám v katastru…
      </p>
    );
  }
  if (matches.length === 0) {
    return <p className="text-xs text-muted-foreground">V katastru nic, parcelu jde zapsat ručně.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="max-h-48 overflow-y-auto py-1">
        {matches.map((m) => (
          <button
            key={`${m.katastralniUzemi}-${m.druh}-${m.cisloParcely}`}
            type="button"
            onClick={() => onPick(m)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/60"
          >
            <LandPlot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">{m.cisloParcely}</span>
            <span className="text-xs text-muted-foreground">
              {KIND_LABEL[m.druh]}
              {formatArea(m.vymeraM2) ? ` · ${formatArea(m.vymeraM2)}` : ""} · k. ú. {m.katastralniUzemi}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
