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
  | "optionset"
  | "image";

export interface FieldDefinition {
  /** Musí odpovídat názvu sloupce v DB. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  /** Jde upravit jen dokud je pole prázdné — jakmile má hodnotu, zamkne se (needitovatelné). */
  lockOnceSet?: boolean;
  /** Jen pro type: "lookup" — logický název cílové entity, např. "Account". */
  targetEntity?: string;
  /** Jen pro type: "lookup" — pole cílové entity použité jako popisek v selectu. */
  displayField?: string;
  /** Jen pro type: "optionset" — klíč option_setu (option_sets.key). */
  optionSetKey?: string;
  /** Jen pro type: "image" — název Supabase Storage bucketu, kam se soubor nahraje. */
  storageBucket?: string;
  /** Napojí ARES lookup pod tohle pole (viz AresCompanyLookup) — "name" hledá podle
   * obchodního jména, "ico" podle přesného 8místného IČO. Jen pro type: "text". */
  aresLookup?: "name" | "ico";
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
  /** Přidá nad sekci vyhledávání adresy v RÚIAN (viz RuianAddressLookup). Sekce musí mít
   * pole address_street/_house_number/_city/_zip/_country — ta se z výběru předvyplní. */
  ruianLookup?: boolean;
}

export interface FormTab {
  label: string;
  sections: FormSection[];
}

export interface FormDefinition {
  entity: string;
  tabs: FormTab[];
  /** Kolik sloupců polí na sekci — parametr formuláře, ne pevná hodnota v enginu. Výchozí 2. */
  columns?: 1 | 2 | 3;
}

export interface ViewColumn {
  field: string;
  label?: string;
}

export type ViewConditionOperator = "eq" | "neq" | "contains" | "notcontains" | "startswith" | "gt" | "lt";

export interface ViewCondition {
  field: string;
  operator: ViewConditionOperator;
  /** `"$currentUser"` se dosadí za id přihlášeného uživatele. */
  value: string;
}

export interface ViewDefinition {
  entity: string;
  name: string;
  label: string;
  columns: ViewColumn[];
  defaultSort?: { field: string; direction: "asc" | "desc" };
  /** Filtry pevně dané tímhle view (na rozdíl od sloupcových filtrů, co si nastaví uživatel
   * v gridu) — VŠECHNY se aplikují zároveň (AND). Každé view je takhle samo o sobě úplné
   * (FetchXML/D365 vzor) — žádný samostatný "status" přepínač navíc vedle view, který by s
   * ním mohl být nekonzistentní. Viz `buildStatusViews` pro Aktivní/Neaktivní/Vše. */
  conditions?: ViewCondition[];
  /** Zobrazí se v přepínači schované za dropdown ("Další ▾"), ne jako samostatná pilulka —
   * pro views používané míň často (viz `buildStatusViews`: Neaktivní/Vše), ať přepínač
   * nezavazí, i když má entita víc views. */
  overflow?: boolean;
}

/** Vstup pro `buildStatusViews` — sloupce/řazení jedné entity, bez name/label/conditions
 * (ty se odvodí automaticky pro každou ze tří generovaných status variant). */
export interface ViewTemplate {
  entity: string;
  columns: ViewColumn[];
  defaultSort?: { field: string; direction: "asc" | "desc" };
}
