"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageUpload } from "@/engine/ImageUpload";
import { supplierAddress, type SupplierProfile } from "@/lib/supplierProfiles";
import { deleteSupplierProfile, saveSupplierProfile, type SupplierProfileInput } from "./actions";

const EMPTY: SupplierProfileInput = {
  nazev: "",
  jmeno: "",
  address_street: "",
  address_house_number: "",
  address_city: "",
  address_zip: "",
  ico: "",
  dic: "",
  je_platce_dph: false,
  bank_account: "",
  email: "",
  telefon: "",
  web: "",
  misto_vystaveni: "",
  logo_url: null,
  default_due_days: 14,
  platnost_nabidky_mesice: 3,
  vychozi_poznamky: "",
  pouzit_pro_nabidky: false,
  pouzit_pro_faktury: false,
};

function toInput(p: SupplierProfile): SupplierProfileInput {
  return {
    nazev: p.nazev,
    jmeno: p.jmeno,
    address_street: p.address_street ?? "",
    address_house_number: p.address_house_number ?? "",
    address_city: p.address_city ?? "",
    address_zip: p.address_zip ?? "",
    ico: p.ico ?? "",
    dic: p.dic ?? "",
    je_platce_dph: p.je_platce_dph,
    bank_account: p.bank_account ?? "",
    email: p.email ?? "",
    telefon: p.telefon ?? "",
    web: p.web ?? "",
    misto_vystaveni: p.misto_vystaveni ?? "",
    logo_url: p.logo_url,
    default_due_days: p.default_due_days,
    platnost_nabidky_mesice: p.platnost_nabidky_mesice,
    vychozi_poznamky: p.vychozi_poznamky ?? "",
    pouzit_pro_nabidky: p.pouzit_pro_nabidky,
    pouzit_pro_faktury: p.pouzit_pro_faktury,
  };
}

export function SupplierProfilesClient({ profiles }: { profiles: SupplierProfile[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; values: SupplierProfileInput } | null>(null);
  const [removing, setRemoving] = useState<SupplierProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SupplierProfileInput>(key: K, value: SupplierProfileInput[K]) {
    setEditing((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));
  }

  async function handleSave() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const result = await saveSupplierProfile(editing.id, editing.values);
    setBusy(false);
    if (result.error) return setError(result.error);
    setEditing(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!removing) return;
    setBusy(true);
    const result = await deleteSupplierProfile(removing.id);
    setBusy(false);
    if (result.error) return setError(result.error);
    setRemoving(null);
    router.refresh();
  }

  const text = (key: keyof SupplierProfileInput, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sp-${key}`}>{label}</Label>
      <Input
        id={`sp-${key}`}
        value={String(editing?.values[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Zatím žádný profil. Dokud ho nezaložíš, tisknou se na dokladech údaje z Nastavení → Fakturace.
        </p>
      ) : (
        profiles.map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.nazev}</span>
                {p.pouzit_pro_nabidky && <Badge>Výchozí pro nabídky</Badge>}
                {p.pouzit_pro_faktury && <Badge>Výchozí pro faktury</Badge>}
              </div>
              <p className="text-sm">
                {p.jmeno}
                {p.ico ? `, IČO ${p.ico}` : ""} · {p.je_platce_dph ? "plátce DPH" : "neplátce DPH"}
              </p>
              <p className="text-xs text-muted-foreground">{supplierAddress(p)}</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" title="Upravit" onClick={() => setEditing({ id: p.id, values: toInput(p) })}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Smazat" onClick={() => setRemoving(p)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))
      )}

      <Button onClick={() => setEditing({ id: null, values: { ...EMPTY, pouzit_pro_nabidky: profiles.length === 0, pouzit_pro_faktury: profiles.length === 0 } })}>
        <Plus className="size-4" />
        Nový profil
      </Button>
      {error && !editing && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Upravit profil dodavatele" : "Nový profil dodavatele"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {text("nazev", "Název profilu", "např. Nabídky – Hájek")}
                {text("jmeno", "Jméno dodavatele (tiskne se)", "Ing. arch. Václav Hájek")}
                {text("address_street", "Ulice")}
                {text("address_house_number", "Číslo popisné")}
                {text("address_city", "Obec")}
                {text("address_zip", "PSČ")}
                {text("ico", "IČO")}
                {text("dic", "DIČ")}
                {text("bank_account", "Bankovní účet", "123456789/0100")}
                {text("misto_vystaveni", "Místo vystavení (i s předložkou)", "V Turnově")}
                {text("email", "E-mail (patička nabídky)")}
                {text("telefon", "Telefon (patička nabídky)")}
                {text("web", "Web (patička nabídky)")}
                <div className="space-y-1.5">
                  <Label htmlFor="sp-due">Splatnost faktur (dní)</Label>
                  <Input
                    id="sp-due"
                    type="number"
                    min={0}
                    value={editing.values.default_due_days}
                    onChange={(e) => set("default_due_days", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-validity">Platnost nabídky (měsíců)</Label>
                  <Input
                    id="sp-validity"
                    type="number"
                    min={0}
                    value={editing.values.platnost_nabidky_mesice}
                    onChange={(e) => set("platnost_nabidky_mesice", Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="sp-vat"
                  checked={editing.values.je_platce_dph}
                  onCheckedChange={(c) => set("je_platce_dph", c === true)}
                />
                <Label htmlFor="sp-vat">Plátce DPH</Label>
              </div>

              <div className="space-y-1.5">
                <Label>Logo (PNG nebo JPG, tiskne se vpravo nahoře bez textu)</Label>
                <ImageUpload bucket="organization-logos" value={editing.values.logo_url} onChange={(url) => set("logo_url", url)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sp-notes">Výchozí poznámky nabídky (jedna na řádek)</Label>
                <Textarea
                  id="sp-notes"
                  rows={6}
                  value={editing.values.vychozi_poznamky}
                  onChange={(e) => set("vychozi_poznamky", e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sp-def-q"
                    checked={editing.values.pouzit_pro_nabidky}
                    onCheckedChange={(c) => set("pouzit_pro_nabidky", c === true)}
                  />
                  <Label htmlFor="sp-def-q">Výchozí pro nabídky</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sp-def-i"
                    checked={editing.values.pouzit_pro_faktury}
                    onCheckedChange={(c) => set("pouzit_pro_faktury", c === true)}
                  />
                  <Label htmlFor="sp-def-i">Výchozí pro faktury</Label>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Ukládám…" : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat profil „{removing?.nazev}“?</DialogTitle>
            <DialogDescription>
              Nabídky a faktury s tímhle profilem se pak vytisknou s výchozím profilem.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? "Mažu…" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
