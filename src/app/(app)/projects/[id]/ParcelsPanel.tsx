"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RuianParcelLookup } from "@/components/RuianParcelLookup";
import type { ParcelMatch } from "@/lib/ruianParcels";
import type { NewProjectParcel } from "./actions";

export type ParcelKind = "stavebni" | "pozemkova";

export interface Parcel {
  id: string;
  parcelni_cislo: string;
  druh: ParcelKind;
  katastralni_uzemi: string | null;
  vymera_m2: number | null;
}

const KIND_LABEL: Record<ParcelKind, string> = {
  stavebni: "Stavební",
  pozemkova: "Pozemková",
};

function formatArea(m2: number | null): string | null {
  if (m2 === null) return null;
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(m2)} m²`;
}

/**
 * Parcely projektu. Stavba stojí běžně na několika parcelách a katastr je dělí na stavební
 * a pozemkové — dřív na to bylo jedno textové pole, kam se to psalo dohromady.
 *
 * Vlastní panel, ne přes formulářový engine: podřízené řádky se editují v kontextu projektu,
 * stejně jako milníky a tým.
 */
export function ParcelsPanel({
  projectId,
  parcels,
  defaultKatastralniUzemi,
  onAdd,
  onRemove,
}: {
  projectId: string;
  parcels: Parcel[];
  defaultKatastralniUzemi: string | null;
  onAdd: (projectId: string, parcel: NewProjectParcel) => Promise<void>;
  onRemove: (projectId: string, parcelId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [cislo, setCislo] = useState("");
  const [druh, setDruh] = useState<ParcelKind>("pozemkova");
  // Katastrální území se u jednoho projektu skoro vždy opakuje — předvyplní se z projektu
  // nebo z posledně přidané parcely.
  const [uzemi, setUzemi] = useState(
    parcels[parcels.length - 1]?.katastralni_uzemi ?? defaultKatastralniUzemi ?? "",
  );
  // Výměra se nezadává ručně — drží se jen tehdy, když parcela přišla z katastru.
  const [vymera, setVymera] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Parcel | null>(null);

  function pickFromRuian(match: ParcelMatch) {
    setCislo(match.cisloParcely);
    setDruh(match.druh);
    // Katastr zná oficiální název území; ten zadaný může být zkrácený ("Turnov" vs "Mašov u Turnova").
    setUzemi(match.katastralniUzemi);
    setVymera(match.vymeraM2);
  }

  function editCislo(value: string) {
    setCislo(value);
    // Ruční úprava čísla ruší výměru — patřila k vybrané parcele, ne k téhle nové.
    setVymera(null);
  }

  async function handleAdd() {
    if (!cislo.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(projectId, {
        parcelniCislo: cislo.trim(),
        druh,
        katastralniUzemi: uzemi.trim() || null,
        vymeraM2: vymera,
      });
      setCislo("");
      setDruh("pozemkova");
      setVymera(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přidání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await onRemove(projectId, removing.id);
      setRemoving(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-32 space-y-1.5">
            <Label htmlFor="parcelCislo">Parcelní číslo</Label>
            <Input
              id="parcelCislo"
              value={cislo}
              onChange={(e) => editCislo(e.target.value)}
              placeholder="např. 1247/3"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          </div>
          <div className="min-w-40 space-y-1.5">
            <Label htmlFor="parcelDruh">Druh</Label>
            {/* `items` mapuje hodnotu na popisek — bez něj by SelectValue po programovém
                nastavení (výběr z katastru) ukázal syrové "stavebni". */}
            <Select
              items={KIND_LABEL}
              value={druh}
              onValueChange={(v) => setDruh((v as ParcelKind) ?? "pozemkova")}
            >
              <SelectTrigger id="parcelDruh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pozemkova">Pozemková</SelectItem>
                <SelectItem value="stavebni">Stavební</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="parcelUzemi">Katastrální území</Label>
            <Input id="parcelUzemi" value={uzemi} onChange={(e) => setUzemi(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={busy || !cislo.trim()}>
            <Plus className="size-4" />
            Přidat
          </Button>
        </div>

        <RuianParcelLookup katastralniUzemi={uzemi} cisloParcely={cislo} onPick={pickFromRuian} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {parcels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          K projektu zatím není zapsaná žádná parcela.
        </p>
      ) : (
        <div className="space-y-2">
          {parcels.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">parc. č. {p.parcelni_cislo}</span>
                <Badge variant="outline">{KIND_LABEL[p.druh]}</Badge>
                {formatArea(p.vymera_m2) && (
                  <span className="text-xs text-muted-foreground">{formatArea(p.vymera_m2)}</span>
                )}
                {p.katastralni_uzemi && (
                  <span className="text-xs text-muted-foreground">k. ú. {p.katastralni_uzemi}</span>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(p)} title="Odebrat parcelu">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odebrat parcelu č. {removing?.parcelni_cislo}?</DialogTitle>
            <DialogDescription>
              Z projektu se odebere jen tahle parcela, ostatní údaje zůstanou.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={busy}>
              {busy ? "Odebírám…" : "Ano, odebrat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
