/**
 * Centrální registr entit — jediné místo, které mapuje logický název entity
 * (FieldDefinition.targetEntity) na skutečnou DB tabulku a pole tvořící
 * zobrazovací popisek. Používá ho EntityFormPage (lookup selecty) i
 * ImportWizard (Excel referenční listy) — nová entita se přidá jednou sem a
 * automaticky funguje všude, bez ručního opakování na každé stránce.
 */
export interface EntityRegistryEntry {
  table: string;
  labelFields: string[];
}

export const entityRegistry: Record<string, EntityRegistryEntry> = {
  User: { table: "users", labelFields: ["first_name", "last_name"] },
  Account: { table: "accounts", labelFields: ["name"] },
  Contact: { table: "contacts", labelFields: ["first_name", "last_name"] },
  ProjectTemplate: { table: "project_templates", labelFields: ["name"] },
  Project: { table: "projects", labelFields: ["name"] },
};
