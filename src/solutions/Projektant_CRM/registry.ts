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
  /** Route na detail záznamu (`${basePath}/${id}`) — null, pokud entita nemá vlastní stránku (např. User). */
  basePath: string | null;
}

export const entityRegistry: Record<string, EntityRegistryEntry> = {
  User: { table: "users", labelFields: ["first_name", "last_name"], basePath: null },
  Account: { table: "accounts", labelFields: ["name"], basePath: "/accounts" },
  Contact: { table: "contacts", labelFields: ["first_name", "last_name"], basePath: "/contacts" },
  ProjectTemplate: { table: "project_templates", labelFields: ["name"], basePath: "/project-templates" },
  Project: { table: "projects", labelFields: ["name"], basePath: "/projects" },
  Lead: { table: "leads", labelFields: ["name"], basePath: "/leads" },
  Activity: { table: "activities", labelFields: ["subject"], basePath: "/activities" },
};
