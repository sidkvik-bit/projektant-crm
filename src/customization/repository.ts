import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CustomizationSet } from "./merge";
import { COMPONENT_TYPES, parseDefinition, type Component, type ComponentRow, type ComponentType } from "./types";

/** Cookie, kterou si customizer zapne náhled rozpracovaných (nepublikovaných) úprav. */
export const PREVIEW_COOKIE = "crm_customization_preview";

const COMPONENT_COLUMNS = "id, component_type, entity_name, key, published, draft, draft_deleted, published_at, updated_at";

/** Všechny řádky komponent firmy přihlášeného uživatele (RLS je omezí na jeho firmu). */
export async function listComponentRows(supabase: SupabaseClient): Promise<ComponentRow[]> {
  const { data, error } = await supabase
    .from("customization_components")
    .select(COMPONENT_COLUMNS)
    .order("component_type")
    .order("entity_name")
    .order("key");
  if (error) throw error;
  return (data ?? []) as ComponentRow[];
}

/**
 * Z řádků vybere platnou vrstvu: publikovanou, v náhledu draft přes publikovanou. Komponenta
 * s neplatnou definicí (ručně rozbitý JSON, starší tvar) se přeskočí — jedna chyba v úpravách
 * nesmí shodit celou appku. Studio ji ukáže jako chybnou.
 */
export function toCustomizationSet(rows: ComponentRow[], preview: boolean): CustomizationSet {
  const components: Component[] = [];
  for (const row of rows) {
    if (!COMPONENT_TYPES.includes(row.component_type)) continue;
    if (preview && row.draft_deleted) continue;
    const raw = preview ? (row.draft ?? row.published) : row.published;
    if (raw == null) continue;
    const parsed = parseDefinition(row.component_type as ComponentType, raw);
    if (!parsed.ok) {
      console.warn(`Přeskakuji neplatnou komponentu ${row.component_type}/${row.entity_name}/${row.key}: ${parsed.error}`);
      continue;
    }
    components.push({ type: row.component_type, entity: row.entity_name, key: row.key, definition: parsed.value });
  }
  return new CustomizationSet(components);
}

const loaded = new WeakMap<SupabaseClient, Promise<CustomizationSet>>();

/**
 * Publikované úpravy pro libovolného Supabase klienta (stránka, server action, MCP) —
 * jednou na instanci klienta. Pluginy a ukládání dat běží vždy nad publikovanou vrstvou;
 * náhled draftu je jen pro vykreslení stránek customizerovi.
 */
export function loadCustomizations(supabase: SupabaseClient): Promise<CustomizationSet> {
  let promise = loaded.get(supabase);
  if (!promise) {
    promise = listComponentRows(supabase).then((rows) => toCustomizationSet(rows, false));
    loaded.set(supabase, promise);
  }
  return promise;
}

/** Úpravy pro vykreslení stránky — v rámci jednoho requestu jen jednou. */
export const getCustomizations = cache(async (): Promise<CustomizationSet> => {
  const supabase = await createClient();
  const preview = (await cookies()).get(PREVIEW_COOKIE)?.value === "1";
  if (!preview) return loadCustomizations(supabase);
  // Draft čte jen customizer — Basic User s nastavenou cookie dostane prostě publikovanou vrstvu.
  const { data: canCustomize } = await supabase.rpc("is_org_customizer");
  const rows = await listComponentRows(supabase);
  return toCustomizationSet(rows, canCustomize === true);
});

export const isPreviewMode = cache(async () => (await cookies()).get(PREVIEW_COOKIE)?.value === "1");
