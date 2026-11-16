import { notFound } from "next/navigation";
import type { EntityDefinition } from "@/engine/types";
import { customEntityDefinition, defaultCustomForm } from "./merge";
import { getCustomizations } from "./repository";

/** Definice vlastní entity pro stránky /c/[entity] — 404, když ji firma nemá (nebo není publikovaná). */
export async function loadCustomEntityPage(name: string) {
  const set = await getCustomizations();
  const component = set.find("entity", name, name);
  if (!component) notFound();
  const entity: EntityDefinition = customEntityDefinition(component, set);
  return { entity, form: defaultCustomForm(entity), definition: component.definition };
}
