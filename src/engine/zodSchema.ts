import { z } from "zod";
import type { EntityDefinition, FieldDefinition } from "./types";

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Field -> Zod schema, shared by FormEngine (via buildEntityZodSchema) and ImportWizard.
 *
 * A required field is gated with a blank-check `refine` BEFORE the type-specific schema
 * runs: react-hook-form leaves a Controller-driven field's value as `undefined` until the
 * user actually types something (a controlled input can visibly render as empty without
 * ever calling `onChange("")`), so `z.string().min(1, ...)` alone would fail at the type
 * level first and surface Zod's generic "expected string, received undefined" instead of
 * the friendly message. An optional field is preprocessed the same way so clearing a
 * lookup/optionset combobox back to "" (FormEngine's Combobox onChange emits "", not null)
 * is treated as "no value" instead of failing e.g. z.uuid()'s format check.
 */
export function fieldToZod(field: FieldDefinition, requiredMessage?: string): z.ZodTypeAny {
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
    case "image":
      schema = z.url("Neplatná URL");
      break;
    case "lookup":
    case "optionset":
      schema = z.uuid("Neplatná hodnota");
      break;
    // "text" | "textarea" | "phone" | "date" | "datetime"
    default:
      schema = z.string();
  }

  if (!field.required) {
    return z.preprocess((v) => (isBlank(v) ? undefined : v), schema.nullable().optional());
  }

  return z
    .any()
    .refine((v) => !isBlank(v), { message: requiredMessage ?? `${field.label} je povinné pole` })
    .pipe(schema);
}

/** Sestaví Zod schema z EntityDefinition — business pole + univerzální status/status_reason. */
export function buildEntityZodSchema(entity: EntityDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of entity.fields) {
    shape[field.name] = fieldToZod(field);
  }

  shape.status = z.enum(["active", "inactive"]).default("active");
  shape.status_reason_id = z.uuid().nullable().optional();
  shape.owner_id = z.uuid().nullable().optional();

  return z.object(shape);
}

export type EntityFormValues = Record<string, unknown>;
