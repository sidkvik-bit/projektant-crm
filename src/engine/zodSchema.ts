import { z } from "zod";
import type { EntityDefinition, FieldDefinition } from "./types";

function fieldToZod(field: FieldDefinition): z.ZodTypeAny {
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
    case "lookup":
    case "optionset":
      schema = z.uuid("Neplatná hodnota");
      break;
    // "text" | "textarea" | "phone" | "date" | "datetime"
    default:
      schema = field.required
        ? z.string().min(1, `${field.label} je povinné pole`)
        : z.string();
  }

  return field.required ? schema : schema.nullable().optional();
}

/** Sestaví Zod schema z EntityDefinition — business pole + univerzální status/status_reason. */
export function buildEntityZodSchema(entity: EntityDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of entity.fields) {
    shape[field.name] = fieldToZod(field);
  }

  shape.status = z.enum(["active", "inactive"]).default("active");
  shape.status_reason_id = z.uuid().nullable().optional();

  return z.object(shape);
}

export type EntityFormValues = Record<string, unknown>;
