import type { EntityDefinition, FieldDefinition } from "./types";

export interface ResolvedFilterField {
  /** Skutečný DB sloupec pro dotaz/řazení (ne dopočtený alias z view jako "account"/"owner"). */
  dbColumn: string;
  field: FieldDefinition;
}

/**
 * Namapuje název sloupce z ViewDefinition — může to být přímo pole entity
 * ("email"), nebo dopočtený alias, který se ve views používá pro lookup/
 * optionset sloupce ("account" pro account_id, "status_reason" pro
 * status_reason_id) — na skutečné DB pole + jeho typ. Používá se pro
 * sloupcové filtry, řazení a popisky v ColumnPickeru. `null`, pokud sloupec
 * není navázaný na žádné skutečné pole entity (např. Activity.entity_type,
 * což je čistě textový diskriminátor bez FieldDefinition).
 */
export function resolveFilterField(entity: EntityDefinition, viewColumnName: string): ResolvedFilterField | null {
  if (viewColumnName === "status_reason") {
    return {
      dbColumn: "status_reason_id",
      field: {
        name: "status_reason_id",
        label: "Důvod stavu",
        type: "optionset",
        optionSetKey: entity.statusReasonOptionSetKey,
      },
    };
  }
  if (viewColumnName === "owner") {
    return {
      dbColumn: "owner_id",
      field: { name: "owner_id", label: "Vlastník", type: "lookup", targetEntity: "User" },
    };
  }
  const direct = entity.fields.find((f) => f.name === viewColumnName);
  if (direct) return { dbColumn: direct.name, field: direct };
  const viaId = entity.fields.find((f) => f.name === `${viewColumnName}_id`);
  if (viaId) return { dbColumn: viaId.name, field: viaId };
  return null;
}
