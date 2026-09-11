"use client";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatUserName } from "./users";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import type { EntityDefinition, FieldDefinition } from "./types";

/**
 * Exportuje záznamy dané entity (podle id) do .xlsx se VŠEMI sloupci entity —
 * ne jen těmi, co jsou zrovna v gridu. Lookup/optionset pole se rozřeší na
 * čitelné názvy (ne GUIDy) přes stejnou FK-konvenci jako zbytek enginu
 * (`<tabulka>_<sloupec>_fkey`), takže funguje pro libovolnou entitu bez
 * entitně-specifického kódu.
 */
export async function exportEntityToExcel(entity: EntityDefinition, ids: string[]) {
  if (ids.length === 0) return;

  const supabase = createClient();

  const lookupFields = entity.fields.filter(
    (f) => f.type === "lookup" && f.targetEntity && (f.targetEntity === "User" || entityRegistry[f.targetEntity]),
  );
  const optionsetFields = entity.fields.filter((f) => f.type === "optionset");
  const plainFields = entity.fields.filter((f) => f.type !== "lookup" && f.type !== "optionset");

  function lookupLabelFields(f: FieldDefinition): string[] {
    return f.targetEntity === "User" ? ["first_name", "last_name"] : entityRegistry[f.targetEntity as string].labelFields;
  }

  const selectParts = [
    "id",
    ...plainFields.map((f) => f.name),
    ...lookupFields.map((f) => {
      const table = f.targetEntity === "User" ? "users" : entityRegistry[f.targetEntity as string].table;
      return `${f.name}:${table}!${entity.table}_${f.name}_fkey(${lookupLabelFields(f).join(", ")})`;
    }),
    ...optionsetFields.map((f) => `${f.name}:option_set_values!${entity.table}_${f.name}_fkey(label)`),
    `status_reason:option_set_values!${entity.table}_status_reason_id_fkey(label)`,
    `owner:users!${entity.table}_owner_id_fkey(first_name, last_name, email)`,
    "status",
    "created_at",
    "updated_at",
  ];

  const { data, error } = await supabase.from(entity.table).select(selectParts.join(", ")).in("id", ids);
  if (error) throw error;

  const headerByColumn: Record<string, string> = {
    id: "ID",
    status: "Stav",
    status_reason: "Důvod stavu",
    owner: "Vlastník",
    created_at: "Vytvořeno",
    updated_at: "Upraveno",
  };
  for (const field of entity.fields) {
    headerByColumn[field.name] = field.label;
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = { [headerByColumn.id]: row.id ?? "" };

    for (const f of plainFields) {
      out[headerByColumn[f.name]] = row[f.name] ?? "";
    }
    for (const f of lookupFields) {
      const related = row[f.name] as Record<string, unknown> | null;
      out[headerByColumn[f.name]] = related
        ? lookupLabelFields(f).map((lf) => related[lf]).filter(Boolean).join(" ") || "—"
        : "";
    }
    for (const f of optionsetFields) {
      out[headerByColumn[f.name]] = (row[f.name] as { label: string } | null)?.label ?? "";
    }

    out[headerByColumn.status] = row.status === "active" ? "Aktivní" : "Neaktivní";
    out[headerByColumn.status_reason] = (row.status_reason as { label: string } | null)?.label ?? "";
    out[headerByColumn.owner] = formatUserName(row.owner as never);
    out[headerByColumn.created_at] = row.created_at ?? "";
    out[headerByColumn.updated_at] = row.updated_at ?? "";
    return out;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Data");
  XLSX.writeFile(wb, `${entity.displayNamePlural.replace(/[\\/?*[\]:]/g, "")}_export.xlsx`);
}
