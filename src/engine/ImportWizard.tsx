"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { z } from "zod";
import { Download, Upload, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getOptionSetValues } from "./optionSets";
import { bulkInsertRecords } from "./entityActions";
import { importableEntities } from "@/solutions/Projektant_CRM/entities";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import type { EntityDefinition, FieldDefinition } from "./types";

/**
 * Centrální, plně samostatný Excel import — pokrývá KAŽDOU entitu z
 * importableEntities. Tok: 1) vyber entitu  2) nahraj libovolný Excel
 * 3) namapuj sloupce souboru na pole entity (auto-návrh podle názvu)
 * 4) kontrola řádků (validace + resolving lookup/optionset textu na ID,
 * proti aktuálním datům z DB — nikdy neslepě podle exportované šablony)
 * 5) import. Přidání nové entity = jeden řádek v entities.ts, nic tady se
 * neupravuje.
 */

interface ReferenceOption {
  id: string;
  label: string;
  disambiguator?: string | null;
}

interface ResolvedReference {
  labelToId: Map<string, string>;
  displayOptions: string[];
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function dedupeOptions(options: ReferenceOption[]): ResolvedReference {
  const groups = new Map<string, ReferenceOption[]>();
  for (const opt of options) {
    const arr = groups.get(opt.label) ?? [];
    arr.push(opt);
    groups.set(opt.label, arr);
  }
  const labelToId = new Map<string, string>();
  const displayOptions: string[] = [];
  for (const [label, group] of groups) {
    if (group.length === 1) {
      labelToId.set(label, group[0].id);
      displayOptions.push(label);
    } else {
      group.forEach((opt, i) => {
        const display = `${label}${opt.disambiguator ? ` (${opt.disambiguator})` : ` (${i + 1})`}`;
        labelToId.set(display, opt.id);
        displayOptions.push(display);
      });
    }
  }
  return { labelToId, displayOptions };
}

function scalarFieldSchema(field: FieldDefinition): z.ZodTypeAny {
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

type Step = "entity" | "upload" | "map" | "review" | "done";

export function ImportWizard({ defaultEntityName }: { defaultEntityName?: string }) {
  const [step, setStep] = useState<Step>("entity");
  const [entityName, setEntityName] = useState<string>(defaultEntityName ?? importableEntities[0]?.name ?? "");
  const [references, setReferences] = useState<Record<string, ResolvedReference>>({});
  const [loadingRefs, setLoadingRefs] = useState(false);

  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // header -> field.name | ""

  const [resolvedRows, setResolvedRows] = useState<Record<string, unknown>[]>([]);
  const [rowErrors, setRowErrors] = useState<(string | null)[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const entity = importableEntities.find((e) => e.name === entityName) as EntityDefinition | undefined;

  useEffect(() => {
    if (!entity) return;
    setLoadingRefs(true);
    const supabase = createClient();
    (async () => {
      const refs: Record<string, ResolvedReference> = {};
      for (const field of entity.fields) {
        if (field.type === "optionset" && field.optionSetKey) {
          const values = await getOptionSetValues(supabase, field.optionSetKey);
          refs[field.name] = dedupeOptions(values.map((v) => ({ id: v.id, label: v.label })));
        } else if (field.type === "lookup" && field.targetEntity && entityRegistry[field.targetEntity]) {
          const reg = entityRegistry[field.targetEntity];
          const { data } = await supabase.from(reg.table).select(`id, ${reg.labelFields.join(", ")}`);
          const options = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
            id: r.id as string,
            label: reg.labelFields.map((f) => r[f]).filter(Boolean).join(" ") || "—",
          }));
          refs[field.name] = dedupeOptions(options);
        }
      }
      setReferences(refs);
      setLoadingRefs(false);
    })();
  }, [entity]);

  const scalarFields = useMemo(
    () => entity?.fields.filter((f) => !references[f.name] && (f.type !== "lookup" && f.type !== "optionset")) ?? [],
    [entity, references],
  );

  const schema = useMemo(
    () => z.object(Object.fromEntries(scalarFields.map((f) => [f.name, scalarFieldSchema(f)]))),
    [scalarFields],
  );

  function downloadTemplate() {
    if (!entity) return;
    const header = entity.fields.map((f) => f.label);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header]), "Data");
    for (const field of entity.fields) {
      const ref = references[field.name];
      if (!ref) continue;
      const sheetName = field.label.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "List";
      const sheet = XLSX.utils.aoa_to_sheet([
        [`Existující hodnoty pro "${field.label}"`],
        ...ref.displayOptions.map((label) => [label]),
      ]);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }
    XLSX.writeFile(wb, `${entity.name}_import_vzor.xlsx`);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });
      const headers = json.length > 0 ? Object.keys(json[0]) : [];

      // Auto-návrh mapování podle normalizované shody názvu.
      const autoMapping: Record<string, string> = {};
      if (entity) {
        for (const header of headers) {
          const match = entity.fields.find(
            (f) => normalize(f.label) === normalize(header) || normalize(f.name) === normalize(header),
          );
          autoMapping[header] = match?.name ?? "";
        }
      }

      setFileHeaders(headers);
      setFileRows(json);
      setMapping(autoMapping);
      setStep("map");
    };
    reader.readAsArrayBuffer(file);
  }

  function applyMappingAndValidate() {
    if (!entity) return;
    const resolved: Record<string, unknown>[] = [];
    const errors: (string | null)[] = [];

    for (const row of fileRows) {
      const mappedRow: Record<string, unknown> = {};
      for (const [header, fieldName] of Object.entries(mapping)) {
        if (!fieldName) continue;
        const value = row[header];
        mappedRow[fieldName] = value === "" ? undefined : value;
      }

      const scalarInput: Record<string, unknown> = {};
      for (const f of scalarFields) scalarInput[f.name] = mappedRow[f.name];
      const parsed = schema.safeParse(scalarInput);

      const parts: string[] = [];
      if (!parsed.success) parts.push(...parsed.error.issues.map((i) => i.message));

      const out: Record<string, unknown> = parsed.success ? { ...parsed.data } : { ...scalarInput };

      for (const [fieldName, ref] of Object.entries(references)) {
        const field = entity.fields.find((f) => f.name === fieldName)!;
        const typed = String(mappedRow[fieldName] ?? "").trim();
        if (!typed) {
          if (field.required) parts.push(`${field.label}: povinné pole`);
          out[fieldName] = null;
          continue;
        }
        const id = ref.labelToId.get(typed);
        if (!id) parts.push(`${field.label}: "${typed}" nenalezeno mezi existujícími hodnotami`);
        out[fieldName] = id ?? null;
      }

      resolved.push(out);
      errors.push(parts.length > 0 ? parts.join("; ") : null);
    }

    setResolvedRows(resolved);
    setRowErrors(errors);
    setStep("review");
  }

  const validIndexes = rowErrors.map((e, i) => (e === null ? i : -1)).filter((i) => i >= 0);
  const allValid = fileRows.length > 0 && validIndexes.length === fileRows.length;

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StepBadge active={step === "entity"} done={step !== "entity"} label="1. Entita" />
        <ArrowRight className="size-3" />
        <StepBadge active={step === "upload"} done={["map", "review", "done"].includes(step)} label="2. Soubor" />
        <ArrowRight className="size-3" />
        <StepBadge active={step === "map"} done={["review", "done"].includes(step)} label="3. Mapování" />
        <ArrowRight className="size-3" />
        <StepBadge active={step === "review"} done={step === "done"} label="4. Kontrola a import" />
      </div>

      {step === "entity" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Do které tabulky chceš data importovat?</p>
          <Select value={entityName} onValueChange={(v) => v && setEntityName(v)}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {importableEntities.map((e) => (
                <SelectItem key={e.name} value={e.name}>
                  {e.displayNamePlural}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={loadingRefs} onClick={() => setStep("upload")}>
            {loadingRefs ? "Načítám…" : "Pokračovat"}
          </Button>
        </div>
      )}

      {step === "upload" && entity && (
        <div className="space-y-3">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="size-4" />
            Stáhnout vzorový soubor (volitelné)
          </Button>
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
            <p className="text-sm">
              Přetáhni libovolný Excel/CSV sem, nebo klikni pro výběr — sloupce namapujeme v dalším kroku.
            </p>
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
        </div>
      )}

      {step === "map" && entity && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Přiřaď sloupce ze souboru k polím entity {entity.displayName}. Nepoužité sloupce nech "Nepoužívat".
          </p>
          <div className="space-y-2">
            {fileHeaders.map((header) => (
              <div key={header} className="flex items-center gap-3 rounded-lg border p-2.5">
                <span className="w-48 shrink-0 truncate text-sm font-medium">{header}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <Select
                  value={mapping[header] || "__ignore__"}
                  onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v === "__ignore__" ? "" : (v ?? "") }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ignore__">Nepoužívat</SelectItem>
                    {entity.fields.map((f) => (
                      <SelectItem key={f.name} value={f.name}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button onClick={applyMappingAndValidate}>Zkontrolovat řádky</Button>
        </div>
      )}

      {step === "review" && entity && !result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {allValid ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
            <span>
              {validIndexes.length} / {fileRows.length} řádků v pořádku
            </span>
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {entity.fields
                    .filter((f) => Object.values(mapping).includes(f.name))
                    .map((f) => (
                      <th key={f.name} className="px-2 py-1.5 text-left font-medium">
                        {f.label}
                      </th>
                    ))}
                  <th className="px-2 py-1.5 text-left font-medium">Chyba</th>
                </tr>
              </thead>
              <tbody>
                {resolvedRows.map((row, i) => (
                  <tr key={i} className={rowErrors[i] ? "bg-destructive/5" : undefined}>
                    {entity.fields
                      .filter((f) => Object.values(mapping).includes(f.name))
                      .map((f) => (
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
                const rows = validIndexes.map((i) => resolvedRows[i]);
                const res = await bulkInsertRecords(entity.table, rows);
                setResult(res);
                setStep("done");
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? "Importuji…" : `Importovat ${validIndexes.length} záznamů`}
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

function StepBadge({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <Badge variant={active || done ? "default" : "secondary"} className="gap-1">
      {label}
    </Badge>
  );
}
