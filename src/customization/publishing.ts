import type { SupabaseClient } from "@supabase/supabase-js";
import { listComponentRows, toCustomizationSet } from "./repository";
import type { ComponentType } from "./types";
import { validateComponent } from "./validation";

// Publikování vrstvy úprav — sdílí ho studio (server actions) i MCP. Volající dodá klienta
// přihlášeného uživatele: oprávnění (jen System Customizer) vynucuje RLS a RPC v databázi.

export type PublishResult<T> = { ok: true; value: T } | { ok: false; error: string };

const errorText = (err: { message: string; code?: string }) =>
  err.code === "42501" ? "Upravovat firmu smí jen uživatel s rolí System Customizer." : err.message;

/** Zkontroluje celý draft (komponenty na sebe odkazují — smazané pole může být ve formuláři…). */
export async function findDraftProblems(supabase: SupabaseClient): Promise<string[]> {
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
  return problems;
}

/** Publikuje všechny rozpracované změny najednou. Vrací číslo publikace. */
export async function publishDrafts(supabase: SupabaseClient, message: string): Promise<PublishResult<number>> {
  const problems = await findDraftProblems(supabase);
  if (problems.length) return { ok: false, error: `Nejde publikovat:\n${problems.join("\n")}` };
  const { data, error } = await supabase.rpc("publish_customizations", { p_message: message.slice(0, 500) });
  return error ? { ok: false, error: errorText(error) } : { ok: true, value: data as number };
}

/** Připraví návrat na stav před publikací jako novou rozpracovanou změnu. */
export async function revertToPublish(supabase: SupabaseClient, publishId: string): Promise<PublishResult<number>> {
  const { data, error } = await supabase.rpc("revert_customization_publish", { p_publish_id: publishId });
  return error ? { ok: false, error: errorText(error) } : { ok: true, value: data as number };
}

/** Zahodí rozpracovanou změnu komponenty (nikdy nepublikovaná komponenta zmizí celá). */
export async function discardDraft(
  supabase: SupabaseClient,
  type: ComponentType,
  entity: string,
  key: string,
): Promise<PublishResult<null>> {
  const match = { component_type: type, entity_name: entity, key };
  const { data: row, error: readError } = await supabase
    .from("customization_components")
    .select("published")
    .match(match)
    .maybeSingle();
  if (readError) return { ok: false, error: errorText(readError) };
  if (!row) return { ok: false, error: "Komponenta neexistuje." };
  const { error } =
    row.published == null
      ? await supabase.from("customization_components").delete().match(match)
      : await supabase.from("customization_components").update({ draft: null, draft_deleted: false }).match(match);
  return error ? { ok: false, error: errorText(error) } : { ok: true, value: null };
}

/** Označí komponentu ke smazání — zmizí až publikováním (a jde vrátit). Nepublikovaná se smaže hned. */
export async function removeComponent(
  supabase: SupabaseClient,
  type: ComponentType,
  entity: string,
  key: string,
): Promise<PublishResult<null>> {
  const match = { component_type: type, entity_name: entity, key };
  const { data: row, error: readError } = await supabase
    .from("customization_components")
    .select("published")
    .match(match)
    .maybeSingle();
  if (readError) return { ok: false, error: errorText(readError) };
  if (!row) return { ok: true, value: null };
  const { error } =
    row.published == null
      ? await supabase.from("customization_components").delete().match(match)
      : await supabase.from("customization_components").update({ draft: null, draft_deleted: true }).match(match);
  return error ? { ok: false, error: errorText(error) } : { ok: true, value: null };
}
