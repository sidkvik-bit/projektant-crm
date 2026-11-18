import { z } from "zod";
import type { EntityDefinition, FieldDefinition } from "@/engine/types";
import type { OptionSetValue } from "@/engine/optionSets";
import { fieldToZod } from "@/engine/zodSchema";
import { matchOptionValue } from "./shared";

// Validace hodnot, které AI posílá do create_record / update_record. Stejná pravidla jako
// formulář ve webu (fieldToZod z metadat entity), navíc whitelist polí: AI smí zapsat jen pole
// z metadat entity (+ stav, důvod stavu, vlastník), nikdy systémová (organization_id, id, …).
// Čistá funkce bez databáze, ať jde otestovat.

const UUID = z.uuid();

/** Pole, která má každá entita navíc k metadatům (univerzální stav a vlastník). */
export function systemFields(entity: EntityDefinition): FieldDefinition[] {
  return [
    { name: "status_reason_id", label: "Důvod stavu / fáze", type: "optionset", optionSetKey: entity.statusReasonOptionSetKey },
    { name: "owner_id", label: "Vlastník", type: "lookup", targetEntity: "User" },
  ];
}

export function writableFields(entity: EntityDefinition): FieldDefinition[] {
  return [...entity.fields, ...systemFields(entity)].filter((f) => !f.readOnly);
}

export type PreparedValues = { ok: true; values: Record<string, unknown> } | { ok: false; errors: string[] };

/**
 * @param options hodnoty číselníků podle optionSetKey — u polí typu optionset AI může poslat
 *   lidský název ("Realizace") místo id; přeloží se tady.
 */
export function prepareValues(
  entity: EntityDefinition,
  input: Record<string, unknown>,
  options: Record<string, OptionSetValue[]>,
  mode: "create" | "update",
): PreparedValues {
  const fields = new Map(writableFields(entity).map((f) => [f.name, f]));
  const readOnly = new Set(entity.fields.filter((f) => f.readOnly).map((f) => f.name));
  const errors: string[] = [];
  const values: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(input)) {
    if (name === "status") {
      if (raw === "active" || raw === "inactive") values.status = raw;
      else errors.push(`status: povolené hodnoty jsou "active" nebo "inactive".`);
      continue;
    }
    const field = fields.get(name);
    if (!field) {
      errors.push(
        readOnly.has(name)
          ? `${name}: pole jde jen číst.`
          : `${name}: entita ${entity.name} takové pole nemá. Povolená pole: status, ${[...fields.keys()].join(", ")}.`,
      );
      continue;
    }

    let value = raw;
    if (field.type === "optionset" && typeof raw === "string" && raw !== "" && !UUID.safeParse(raw).success) {
      const match = matchOptionValue(options[field.optionSetKey ?? ""] ?? [], raw);
      if ("available" in match) {
        errors.push(`${name}: hodnota "${raw}" neexistuje. Možnosti: ${match.available.join(", ")}.`);
        continue;
      }
      value = match.value.id;
    }
    if (field.type === "lookup" && typeof raw === "string" && raw !== "" && !UUID.safeParse(raw).success) {
      errors.push(`${name}: čeká se id záznamu (${field.targetEntity}). Najdi ho přes list_records nebo search_crm.`);
      continue;
    }

    const parsed = fieldToZod(field).safeParse(value);
    if (!parsed.success) {
      errors.push(`${name}: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
      continue;
    }
    values[name] = parsed.data ?? null;
  }

  if (mode === "create") {
    for (const field of entity.fields.filter((f) => f.required && !f.readOnly)) {
      if (input[field.name] === undefined) errors.push(`${field.name}: ${field.label} je povinné pole.`);
    }
  }
  if (mode === "update" && Object.keys(values).length === 0 && errors.length === 0) {
    errors.push("Nebylo co změnit — uveď aspoň jedno pole.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** Pro čitelný výstup: id hodnot číselníků → názvy. */
export function labelOptionValues(
  entity: EntityDefinition,
  row: Record<string, unknown>,
  options: Record<string, OptionSetValue[]>,
): Record<string, unknown> {
  const out = { ...row };
  for (const field of [...entity.fields, ...systemFields(entity)]) {
    if (field.type !== "optionset" || typeof out[field.name] !== "string") continue;
    const label = (options[field.optionSetKey ?? ""] ?? []).find((v) => v.id === out[field.name])?.label;
    if (label) out[field.name] = { id: out[field.name], label };
  }
  return out;
}
