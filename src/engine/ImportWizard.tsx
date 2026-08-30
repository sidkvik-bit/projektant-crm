"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { z } from "zod";
import { Download, Upload, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EntityDefinition, FieldDefinition } from "./types";

/**
 * Generický 3-krokový Excel import — parametrizovaný EntityDefinition, stejně
 * jako FormEngine/GridEngine. Podporuje jen skalární pole (text/number/date/
 * boolean/email/url) — lookup a optionset sloupce (potřebují resolvovat ID)
 * jsou zatím mimo rozsah a v šabloně se přeskakují.
 */

function fieldRowSchema(field: FieldDefinition): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case "number":
    case "currency":
      schema = z.coerce.number();
      break;
    case "boolean":
      schema = z.coerce.boolean();
      break;
    case "email":
      schema = z.email("Neplatný e-mail");
      break;
    case "url":
      schema = z.url("Neplatná URL");
      break;
    default:
      schema = z.string();
  }
  if (field.required) {
    if (schema instanceof z.ZodString) schema = schema.min(1, "Povinné pole");
  } else {
    schema = schema.nullable().optional();
  }
  return schema;
}

export function ImportWizard({
  entity,
  onImport,
}: {
  entity: EntityDefinition;
  onImport: (rows: Record<string, unknown>[]) => Promise<{ imported: number }>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowErrors, setRowErrors] = useState<(string | null)[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importableFields = useMemo(
    () => entity.fields.filter((f) => f.type !== "lookup" && f.type !== "optionset"),
    [entity],
  );

  const schema = useMemo(
    () =>
      z.object(Object.fromEntries(importableFields.map((f) => [f.name, fieldRowSchema(f)]))),
    [importableFields],
  );

  function downloadTemplate() {
    const header = importableFields.map((f) => f.label);
    const ws = XLSX.utils.aoa_to_sheet([header]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${entity.name}_import_vzor.xlsx`);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });

      const labelToName = Object.fromEntries(importableFields.map((f) => [f.label, f.name]));
      const mapped = json.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [label, value] of Object.entries(row)) {
          const name = labelToName[label];
          if (name) out[name] = value === "" ? undefined : value;
        }
        return out;
      });

      const errors = mapped.map((row) => {
        const parsed = schema.safeParse(row);
        return parsed.success ? null : parsed.error.issues.map((i) => i.message).join(", ");
      });

      setRows(mapped);
      setRowErrors(errors);
      setStep(3);
    };
    reader.readAsArrayBuffer(file);
  }

  const validRows = rows.filter((_, i) => rowErrors[i] === null);
  const allValid = rows.length > 0 && validRows.length === rows.length;

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StepBadge n={1} active={step === 1} done={step > 1} label="Stáhnout vzor" />
        <span>→</span>
        <StepBadge n={2} active={step === 2} done={step > 2} label="Nahrát soubor" />
        <span>→</span>
        <StepBadge n={3} active={step === 3} done={false} label="Kontrola a import" />
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Stáhni si vzorový Excel s hlavičkami podle polí entity {entity.displayName}.
          </p>
          <Button
            onClick={() => {
              downloadTemplate();
              setStep(2);
            }}
          >
            <Download className="size-4" />
            Stáhnout vzor
          </Button>
        </div>
      )}

      {step === 2 && (
        <div
          className="cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/20"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <Upload className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm">Přetáhni vyplněný soubor sem, nebo klikni pro výběr.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {step === 3 && !result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {allValid ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
            <span>
              {validRows.length} / {rows.length} řádků v pořádku
            </span>
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {importableFields.map((f) => (
                    <th key={f.name} className="px-2 py-1.5 text-left font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-left font-medium">Chyba</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={rowErrors[i] ? "bg-destructive/5" : undefined}>
                    {importableFields.map((f) => (
                      <td key={f.name} className="px-2 py-1.5">
                        {String(row[f.name] ?? "")}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-xs text-destructive">{rowErrors[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            disabled={!allValid || importing}
            onClick={async () => {
              setImporting(true);
              try {
                const res = await onImport(validRows);
                setResult(res);
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? "Importuji…" : `Importovat ${validRows.length} záznamů`}
          </Button>
        </div>
      )}

      {result && (
        <p className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="size-4" />
          Naimportováno {result.imported} záznamů.
        </p>
      )}
    </div>
  );
}

function StepBadge({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <Badge variant={active || done ? "default" : "secondary"} className="gap-1">
      {n}. {label}
    </Badge>
  );
}
