"use client";

import { useEffect, useRef, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RuianAddress, RuianSuggestion } from "@/lib/ruian";
import type { EntityFormValues } from "@/engine/zodSchema";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/**
 * Vyhledání adresy v RÚIAN (registr adres ČÚZK) nad adresní sekcí formuláře. Vlastní pole,
 * které se do záznamu neukládá — jen předvyplní Ulici/Číslo/Obec/PSČ/Stát (a u projektu i GPS).
 *
 * Záměrně to NENÍ našeptávač přilepený k poli Ulice jako u ARES: dotaz do RÚIAN musí obsahovat
 * ulici, číslo i obec dohromady, takže nepatří do žádného z těch pěti polí. Pole pod tím zůstávají
 * obyčejné inputy — ruční zadání je pořád ta hlavní cesta, tohle je zkratka.
 */
export function RuianAddressLookup({
  setValue,
  hasGps,
}: {
  setValue: UseFormSetValue<EntityFormValues>;
  /** Projekt má gps_lat/gps_lng pro mapu, firma a kontakt ne. */
  hasGps: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RuianSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<string | null>(null);
  // Po výběru nesmí debounce hned znovu otevřít nabídku nad textem, který jsme sami nastavili.
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      // Úklid zastaralých výsledků, když dotaz spadne pod hranici — ne synchronizace
      // vnějšího stavu, takže setState přímo v efektu je tu v pořádku.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ruian/address?q=${encodeURIComponent(text)}`);
        const data = (await res.json()) as { suggestions: RuianSuggestion[]; error?: string };
        setSuggestions(data.suggestions ?? []);
        setError(data.error ?? null);
      } catch {
        setSuggestions([]);
        setError("Registr adres ČÚZK je momentálně nedostupný.");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(suggestion: RuianSuggestion) {
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ruian/address?q=${encodeURIComponent(suggestion.text)}&key=${encodeURIComponent(suggestion.magicKey)}`,
      );
      const data = (await res.json()) as { address: RuianAddress | null; error?: string };
      if (!data.address) {
        setError(data.error ?? "Adresu se nepodařilo dotáhnout, zadejte ji prosím ručně.");
        return;
      }

      const a = data.address;
      setValue("address_street", a.street ?? "", { shouldDirty: true });
      setValue("address_house_number", a.houseNumber ?? "", { shouldDirty: true });
      setValue("address_city", a.city ?? "", { shouldDirty: true });
      setValue("address_zip", a.zip ?? "", { shouldDirty: true });
      setValue("address_country", "Česká republika", { shouldDirty: true });
      if (hasGps && a.lat !== null && a.lng !== null) {
        setValue("gps_lat", a.lat, { shouldDirty: true });
        setValue("gps_lng", a.lng, { shouldDirty: true });
      }

      skipNextSearchRef.current = true;
      setQuery(a.label);
      setSuggestions([]);
      setFilled(a.label);
    } catch {
      setError("Adresu se nepodařilo dotáhnout, zadejte ji prosím ručně.");
    } finally {
      setResolving(false);
    }
  }

  function clear() {
    skipNextSearchRef.current = true;
    setQuery("");
    setSuggestions([]);
    setFilled(null);
    setError(null);
  }

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH;
  const noMatches = !loading && !tooShort && query.trim().length >= MIN_QUERY_LENGTH && suggestions.length === 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="ruian-search">Najít adresu v registru RÚIAN</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="ruian-search"
          className="pl-8 pr-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="např. Husova 31 Liberec"
          autoComplete="off"
        />
        {(loading || resolving) && (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {!loading && !resolving && query.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={clear}
            title="Vymazat hledání"
          >
            <X className="size-3.5" />
          </Button>
        )}

        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
            <div className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((s) => (
                <button
                  key={s.magicKey}
                  type="button"
                  onClick={() => pick(s)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : filled ? (
        <p className="text-xs text-muted-foreground">Adresa vyplněna z RÚIAN — pole níž jdou dál upravit.</p>
      ) : noMatches ? (
        <p className="text-xs text-muted-foreground">
          Nic nenalezeno. Zkuste doplnit číslo popisné a obec, nebo adresu vyplňte ručně níž.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nepovinná zkratka — adresu můžete stejně dobře vyplnit ručně v polích níž.
        </p>
      )}
    </div>
  );
}
