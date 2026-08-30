"use client";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { EntityDefinition } from "./types";

/**
 * Exportuje záznamy dané entity (podle id) do .xlsx se VŠEMI sloupci entity —
 * ne jen těmi, co jsou zrovna v gridu. Funguje pro libovolnou entitu, protože
 * čerpá jen z EntityDefinition.fields, nic entitně-specifického.
 */
export async function exportEntityToExcel(entity: EntityDefinition, ids: string[]) {
  if (ids.length === 0) return;

  const supabase = createClient();
  const columns = [
    "id",
    ...entity.fields.map((f) => f.name),
    "status",
    "status_reason_id",
    "owner_id",
    "created_at",
    "updated_at",
  ];

  const { data, error } = await supabase.from(entity.table).select(columns.join(", ")).in("id", ids);
  if (error) throw error;

  const headerByColumn: Record<string, string> = {
    id: "ID",
    status: "Stav",
    status_reason_id: "Důvod stavu (ID)",
    owner_id: "Vlastník (ID)",
    created_at: "Vytvořeno",
    updated_at: "Upraveno",
  };
  for (const field of entity.fields) {
    headerByColumn[field.name] = field.label;
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = {};
    for (const column of columns) {
      out[headerByColumn[column] ?? column] = row[column] ?? "";
    }
    return out;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Data");
  XLSX.writeFile(wb, `${entity.displayNamePlural.replace(/[\\/?*[\]:]/g, "")}_export.xlsx`);
}
