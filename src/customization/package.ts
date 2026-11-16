import { z } from "zod";
import { COMPONENT_TYPES } from "./types";

/** Balíček úprav firmy (export/import) — jako D365 solution zip, jen čitelný JSON. */
export const packageSchema = z.object({
  format: z.literal("projektant-crm-customization"),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  components: z
    .array(
      z.object({
        type: z.enum(COMPONENT_TYPES),
        entity: z.string(),
        key: z.string(),
        definition: z.unknown(),
      }),
    )
    .max(2000),
});
export type CustomizationPackage = z.infer<typeof packageSchema>;

export function parsePackage(json: string): { ok: true; value: CustomizationPackage } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Soubor není platný JSON." };
  }
  const result = packageSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Neplatný balíček úprav (${issue.path.join(".") || "kořen"}: ${issue.message}).` };
  }
  return { ok: true, value: result.data };
}
