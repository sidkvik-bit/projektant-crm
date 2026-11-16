import { entityRegistry, type EntityRegistryEntry } from "@/solutions/Projektant_CRM/registry";
import { CUSTOM_RECORDS_TABLE, type CustomizationSet } from "./merge";

export interface ResolvedEntityRef extends EntityRegistryEntry {
  /** Podmínka, která z tabulky vybere jen záznamy téhle entity (vlastní entity sdílí tabulku). */
  filter?: Record<string, string>;
}

export const customEntityBasePath = (name: string) => `/c/${name}`;

/** Registr entit základního řešení rozšířený o vlastní entity firmy. */
export function resolveEntityRef(name: string, set: CustomizationSet): ResolvedEntityRef | null {
  const base = entityRegistry[name];
  if (base) return base;
  if (!set.find("entity", name, name)) return null;
  return {
    table: CUSTOM_RECORDS_TABLE,
    labelFields: ["name"],
    basePath: customEntityBasePath(name),
    filter: { entity_name: name },
  };
}

/** Logický název entity podle tabulky (+ entity_name u vlastních entit) — pro pluginy v datové vrstvě. */
export function entityNameForTable(table: string, values?: Record<string, unknown>): string | null {
  if (table === CUSTOM_RECORDS_TABLE) return typeof values?.entity_name === "string" ? values.entity_name : null;
  return Object.entries(entityRegistry).find(([, e]) => e.table === table)?.[0] ?? null;
}

/** Cesty na detail záznamu pro vlastní entity — FormEngine (klient) zná jen statický registr. */
export function customEntityBasePaths(set: CustomizationSet): Record<string, string> {
  return Object.fromEntries(set.of("entity").map((c) => [c.key, customEntityBasePath(c.key)]));
}
