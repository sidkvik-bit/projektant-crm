import { CUSTOM_PREFIX } from "./types";

// Hodnoty vlastních polí žijí v DB ve sloupci `custom` (jsonb, klíč = celý název pole), ve
// formulářích, gridu a pluginech ale vystupují jako obyčejná pole záznamu ("new_cislo": 12).
// Tady je jediné místo, které mezi těmi dvěma tvary převádí.

export const CUSTOM_COLUMN = "custom";

export const isCustomFieldName = (name: string) => name.startsWith(CUSTOM_PREFIX);

/** { name: "X", new_a: 1 } → { name: "X", custom: { new_a: 1 } }. Prázdný řetězec = smazat (null). */
export function foldCustomValues(values: Record<string, unknown>): Record<string, unknown> {
  const custom: Record<string, unknown> = { ...((values[CUSTOM_COLUMN] as Record<string, unknown> | undefined) ?? {}) };
  const rest: Record<string, unknown> = {};
  let hasCustom = CUSTOM_COLUMN in values;

  for (const [key, value] of Object.entries(values)) {
    if (key === CUSTOM_COLUMN) continue;
    if (isCustomFieldName(key)) {
      custom[key] = value === "" || value === undefined ? null : value;
      hasCustom = true;
    } else {
      rest[key] = value;
    }
  }
  return hasCustom ? { ...rest, [CUSTOM_COLUMN]: custom } : rest;
}

/** { name: "X", custom: { new_a: 1 } } → { name: "X", new_a: 1 }. Řádky bez `custom` beze změny. */
export function unfoldCustomValues<T extends Record<string, unknown>>(row: T): T {
  const custom = row[CUSTOM_COLUMN];
  if (!custom || typeof custom !== "object") return row;
  const rest: Record<string, unknown> = { ...row };
  delete rest[CUSTOM_COLUMN];
  return { ...rest, ...(custom as Record<string, unknown>) } as T;
}

/** Sloupec pro filtr/řazení přes PostgREST — vlastní pole je klíč v jsonb. */
export function dbColumnRef(field: string): string {
  return isCustomFieldName(field) ? `${CUSTOM_COLUMN}->>${field}` : field;
}
