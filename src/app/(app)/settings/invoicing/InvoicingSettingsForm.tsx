"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/engine/ImageUpload";
import { accountToIban } from "@/lib/czechBank";
import { updateInvoicingSettings, type InvoicingSettingsInput } from "./actions";

type InitialSettings = {
  logo_url: string | null;
  ico: string | null;
  dic: string | null;
  address_street: string | null;
  address_house_number: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_country: string | null;
  bank_account: string | null;
  invoice_number_prefix: string;
  default_due_days: number;
} | null;

const EMPTY: InvoicingSettingsInput = {
  logo_url: null,
  ico: "",
  dic: "",
  address_street: "",
  address_house_number: "",
  address_city: "",
  address_zip: "",
  address_country: "",
  bank_account: "",
  invoice_number_prefix: "FAK",
  default_due_days: 14,
};

export function InvoicingSettingsForm({ initial }: { initial: InitialSettings }) {
  const [values, setValues] = useState<InvoicingSettingsInput>(
    initial
      ? {
          logo_url: initial.logo_url,
          ico: initial.ico ?? "",
          dic: initial.dic ?? "",
          address_street: initial.address_street ?? "",
          address_house_number: initial.address_house_number ?? "",
          address_city: initial.address_city ?? "",
          address_zip: initial.address_zip ?? "",
          address_country: initial.address_country ?? "",
          bank_account: initial.bank_account ?? "",
          invoice_number_prefix: initial.invoice_number_prefix ?? "FAK",
          default_due_days: initial.default_due_days ?? 14,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof InvoicingSettingsInput>(key: K, value: InvoicingSettingsInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  const iban = values.bank_account.trim() ? accountToIban(values.bank_account) : null;
  const bankAccountLooksInvalid = values.bank_account.trim() !== "" && !iban;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateInvoicingSettings(values);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Logo</h3>
        <ImageUpload
          bucket="organization-logos"
          value={values.logo_url}
          onChange={(url) => set("logo_url", url)}
        />
        <p className="text-xs text-muted-foreground">Tiskne se v hlavičce PDF nabídek a faktur.</p>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Fakturační adresa</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-ico">IČO</Label>
            <Input id="inv-ico" value={values.ico} onChange={(e) => set("ico", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-dic">DIČ</Label>
            <Input id="inv-dic" value={values.dic} onChange={(e) => set("dic", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-street">Ulice</Label>
            <Input id="inv-street" value={values.address_street} onChange={(e) => set("address_street", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-house-number">Číslo popisné/orientační</Label>
            <Input
              id="inv-house-number"
              value={values.address_house_number}
              onChange={(e) => set("address_house_number", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-city">Obec</Label>
            <Input id="inv-city" value={values.address_city} onChange={(e) => set("address_city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-zip">PSČ</Label>
            <Input id="inv-zip" value={values.address_zip} onChange={(e) => set("address_zip", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-country">Stát</Label>
            <Input id="inv-country" value={values.address_country} onChange={(e) => set("address_country", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Bankovní účet</h3>
        <div className="space-y-1.5">
          <Label htmlFor="inv-bank-account">Číslo účtu</Label>
          <Input
            id="inv-bank-account"
            value={values.bank_account}
            onChange={(e) => set("bank_account", e.target.value)}
            placeholder="123456-2000145399/0800"
          />
          {iban && <p className="text-sm text-muted-foreground">IBAN: {iban}</p>}
          {bankAccountLooksInvalid && (
            <p className="text-sm text-destructive">
              Tohle nevypadá jako platné české číslo účtu (formát [předčíslí-]číslo/kód banky) — bez něj se na
              faktury nevygeneruje QR Platba.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-medium text-muted-foreground">Číslování faktur</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-prefix">Předčíslí</Label>
            <Input
              id="inv-prefix"
              value={values.invoice_number_prefix}
              onChange={(e) => set("invoice_number_prefix", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Číslo faktury bude ve tvaru {values.invoice_number_prefix || "FAK"}-2026-0001, řada se každý rok
              vynuluje zpět na 1.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-due-days">Splatnost (dní)</Label>
            <Input
              id="inv-due-days"
              type="number"
              min={0}
              value={values.default_due_days}
              onChange={(e) => set("default_due_days", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Ukládám…" : "Uložit"}
        </Button>
        {saved && <p className="text-sm text-status-success">Uloženo.</p>}
      </div>
    </div>
  );
}
