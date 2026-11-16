import type { SupabaseClient } from "@supabase/supabase-js";
import { baseCatalog } from "@/solutions/Projektant_CRM/catalog";
import type { CustomizationSet } from "./merge";
import { listComponentRows, toCustomizationSet } from "./repository";
import { parseDefinition, type ComponentRow, type ComponentType } from "./types";

// Stav vrstvy úprav pro studio (Nastavení → Přizpůsobení).

export type ComponentStatus = "published" | "new" | "changed" | "deleted";

export const STATUS_LABEL: Record<ComponentStatus, string> = {
  published: "Publikováno",
  new: "Nové — nepublikováno",
  changed: "Změněno — nepublikováno",
  deleted: "Ke smazání — nepublikováno",
};

export interface StudioComponent {
  type: ComponentType;
  entity: string;
  key: string;
  status: ComponentStatus;
  published: unknown;
  draft: unknown;
  /** To, co customizer edituje: draft, jinak publikovaná verze. */
  current: unknown;
  /** Chyba definice (neplatný JSON tvar) — komponenta se v appce přeskakuje. */
  error: string | null;
  updatedAt: string;
}

export interface StudioState {
  components: StudioComponent[];
  /** Vrstva tak, jak bude po publikování (draft přes publikovanou). */
  draft: CustomizationSet;
  pendingCount: number;
}

export function statusOf(row: ComponentRow): ComponentStatus {
  if (row.draft_deleted) return "deleted";
  if (row.published == null) return "new";
  if (row.draft != null) return "changed";
  return "published";
}

export async function loadStudio(supabase: SupabaseClient): Promise<StudioState> {
  const rows = await listComponentRows(supabase);
  const components = rows.map((row): StudioComponent => {
    const current = row.draft ?? row.published;
    const parsed = current == null ? null : parseDefinition(row.component_type, current);
    return {
      type: row.component_type,
      entity: row.entity_name,
      key: row.key,
      status: statusOf(row),
      published: row.published,
      draft: row.draft,
      current,
      error: parsed && !parsed.ok ? parsed.error : null,
      updatedAt: row.updated_at,
    };
  });
  return {
    components,
    draft: toCustomizationSet(rows, true),
    pendingCount: components.filter((c) => c.status !== "published").length,
  };
}

/** Entity, které jde upravovat: základní řešení + vlastní entity firmy (i nepublikované). */
export function studioEntities(state: StudioState) {
  const base = Object.values(baseCatalog).map(({ entity }) => ({
    name: entity.name,
    label: entity.displayNamePlural,
    custom: false,
  }));
  const custom = state.components
    .filter((c) => c.type === "entity")
    .map((c) => ({
      name: c.key,
      label: (c.current as { displayNamePlural?: string } | null)?.displayNamePlural ?? c.key,
      custom: true,
    }));
  return [...base, ...custom];
}
