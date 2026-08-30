// Metadata typy pro FormEngine/GridEngine — zrcadlí strukturu
// /src/solutions/Projektant_CRM/Entities/*.json (PowerApps Solution inspirace).

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "boolean"
  | "lookup"
  | "optionset";

export interface FieldDefinition {
  /** Musí odpovídat názvu sloupce v DB. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  /** Jen pro type: "lookup" — logický název cílové entity, např. "Account". */
  targetEntity?: string;
  /** Jen pro type: "lookup" — pole cílové entity použité jako popisek v selectu. */
  displayField?: string;
  /** Jen pro type: "optionset" — klíč option_setu (option_sets.key). */
  optionSetKey?: string;
}

export interface EntityDefinition {
  /** Logický název entity, např. "Lead". */
  name: string;
  /** Skutečná DB tabulka, např. "leads". */
  table: string;
  displayName: string;
  displayNamePlural: string;
  /** Pole použité jako titulek záznamu. */
  primaryField: string;
  /** Klíč option_setu pro univerzální status_reason (D365 vzor). */
  statusReasonOptionSetKey: string;
  fields: FieldDefinition[];
}

export interface FormSection {
  label: string;
  /** Názvy polí — z EntityDefinition.fields, nebo "status" / "status_reason". */
  fields: string[];
}

export interface FormTab {
  label: string;
  sections: FormSection[];
}

export interface FormDefinition {
  entity: string;
  tabs: FormTab[];
}

export interface ViewColumn {
  field: string;
  label?: string;
}

export interface ViewDefinition {
  entity: string;
  name: string;
  label: string;
  columns: ViewColumn[];
  defaultSort?: { field: string; direction: "asc" | "desc" };
}
