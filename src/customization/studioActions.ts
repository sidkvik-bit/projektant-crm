"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/currentUser";
import { listComponentRows, PREVIEW_COOKIE, toCustomizationSet } from "./repository";
import { validateComponent } from "./validation";
import { COMPONENT_TYPES, type ComponentType } from "./types";
import { parsePackage, type CustomizationPackage } from "./package";

// Server actions studia (Nastavení → Přizpůsobení). Zápis do customization_components hlídá
// RLS (is_org_customizer), tady je jen čitelnější chyba a validace definic, ať do vrstvy
// nejde uložit nic, co by appka neuměla vykreslit.

export type StudioResult<T = null> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error),
});

async function requireCustomizer() {
  const user = await getCurrentUserContext();
  if (!user?.isCustomizer) throw new Error("Upravovat firmu smí jen System Customizer.");
  return createClient();
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function saveComponentDraft(
  type: ComponentType,
  entity: string,
  key: string,
  definition: unknown,
): Promise<StudioResult<{ warnings: string[] }>> {
  try {
    if (!COMPONENT_TYPES.includes(type)) throw new Error(`Neznámý typ komponenty "${type}"`);
    const supabase = await requireCustomizer();
    const set = toCustomizationSet(await listComponentRows(supabase), true);
    const checked = await validateComponent(supabase, set, { type, entity, key, definition });
    if (!checked.ok) return checked;

    const { error } = await supabase.from("customization_components").upsert(
      { component_type: type, entity_name: entity, key, draft: checked.value.definition, draft_deleted: false },
      { onConflict: "organization_id,component_type,entity_name,key" },
    );
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: { warnings: checked.value.warnings } };
  } catch (err) {
    return fail(err);
  }
}

/** Smazání jde přes draft (draft_deleted) — zmizí až publikováním; nepublikovaná se smaže hned. */
export async function deleteComponent(type: ComponentType, entity: string, key: string): Promise<StudioResult> {
  try {
    const supabase = await requireCustomizer();
    const match = { component_type: type, entity_name: entity, key };
    const { data: row, error: readError } = await supabase
      .from("customization_components")
      .select("published")
      .match(match)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return { ok: true, value: null };

    const { error } =
      row.published == null
        ? await supabase.from("customization_components").delete().match(match)
        : await supabase.from("customization_components").update({ draft: null, draft_deleted: true }).match(match);
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: null };
  } catch (err) {
    return fail(err);
  }
}

/** Zahodí rozpracovanou změnu komponenty — vrátí se publikovaná verze. */
export async function discardComponentDraft(type: ComponentType, entity: string, key: string): Promise<StudioResult> {
  try {
    const supabase = await requireCustomizer();
    const match = { component_type: type, entity_name: entity, key };
    const { data: row } = await supabase.from("customization_components").select("published").match(match).maybeSingle();
    const { error } =
      row && row.published == null
        ? await supabase.from("customization_components").delete().match(match)
        : await supabase.from("customization_components").update({ draft: null, draft_deleted: false }).match(match);
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: null };
  } catch (err) {
    return fail(err);
  }
}

export async function publishCustomizations(message: string): Promise<StudioResult<number>> {
  try {
    const supabase = await requireCustomizer();
    // Před publikací znovu zkontrolovat celý draft — mezi uložením komponent se mohly
    // změnit ty, na které odkazují (smazané pole, které je ve formuláři…).
    const rows = await listComponentRows(supabase);
    const set = toCustomizationSet(rows, true);
    const problems: string[] = [];
    for (const row of rows.filter((r) => r.draft != null && !r.draft_deleted)) {
      const checked = await validateComponent(supabase, set, {
        type: row.component_type,
        entity: row.entity_name,
        key: row.key,
        definition: row.draft,
      });
      if (!checked.ok) problems.push(`${row.component_type} ${row.entity_name}/${row.key}: ${checked.error}`);
    }
    if (problems.length) return { ok: false, error: `Nejde publikovat:\n${problems.join("\n")}` };

    const { data, error } = await supabase.rpc("publish_customizations", { p_message: message.slice(0, 500) });
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: data as number };
  } catch (err) {
    return fail(err);
  }
}

export async function revertPublish(publishId: string): Promise<StudioResult<number>> {
  try {
    const supabase = await requireCustomizer();
    const { data, error } = await supabase.rpc("revert_customization_publish", { p_publish_id: publishId });
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: data as number };
  } catch (err) {
    return fail(err);
  }
}

export async function setPreviewMode(on: boolean): Promise<void> {
  const store = await cookies();
  if (on) store.set(PREVIEW_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 8 });
  else store.delete(PREVIEW_COOKIE);
  revalidateAll();
}

/** Balíček publikovaných úprav firmy (JSON) — záloha, přenos do jiné firmy, verze v gitu. */
export async function exportPackage(): Promise<StudioResult<CustomizationPackage>> {
  try {
    const supabase = await requireCustomizer();
    const rows = await listComponentRows(supabase);
    return {
      ok: true,
      value: {
        format: "projektant-crm-customization",
        version: 1,
        exportedAt: new Date().toISOString(),
        components: rows
          .filter((r) => r.published != null)
          .map((r) => ({ type: r.component_type, entity: r.entity_name, key: r.key, definition: r.published })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Import balíčku jako rozpracovaných změn — nic se nepublikuje, customizer to zkontroluje. */
export async function importPackage(json: string): Promise<StudioResult<{ imported: number; warnings: string[] }>> {
  try {
    const supabase = await requireCustomizer();
    const pkg = parsePackage(json);
    if (!pkg.ok) return pkg;

    // Validuje se proti stavu "po importu", ať můžou komponenty z balíčku odkazovat na sebe.
    const current = await listComponentRows(supabase);
    const merged = toCustomizationSet(
      [
        ...current.filter(
          (r) => !pkg.value.components.some((c) => c.type === r.component_type && c.entity === r.entity_name && c.key === r.key),
        ),
        ...pkg.value.components.map((c) => ({
          id: "",
          component_type: c.type,
          entity_name: c.entity,
          key: c.key,
          published: null,
          draft: c.definition,
          draft_deleted: false,
          published_at: null,
          updated_at: "",
        })),
      ],
      true,
    );

    const warnings: string[] = [];
    const rows = [];
    for (const c of pkg.value.components) {
      const checked = await validateComponent(supabase, merged, { type: c.type, entity: c.entity, key: c.key, definition: c.definition });
      if (!checked.ok) return { ok: false, error: `${c.type} ${c.entity}/${c.key}: ${checked.error}` };
      warnings.push(...checked.value.warnings.map((w) => `${c.type} ${c.entity}/${c.key}: ${w}`));
      rows.push({ component_type: c.type, entity_name: c.entity, key: c.key, draft: checked.value.definition, draft_deleted: false });
    }
    const { error } = await supabase
      .from("customization_components")
      .upsert(rows, { onConflict: "organization_id,component_type,entity_name,key" });
    if (error) throw error;
    revalidateAll();
    return { ok: true, value: { imported: rows.length, warnings } };
  } catch (err) {
    return fail(err);
  }
}
