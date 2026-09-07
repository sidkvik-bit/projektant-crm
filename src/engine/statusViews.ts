import type { EntityDefinition, ViewDefinition, ViewTemplate } from "./types";

/**
 * Rozpadne jednu šablonu (sloupce/řazení) na tři samostatná systémová views — Aktivní,
 * Neaktivní, Vše — každé s vlastní explicitní status podmínkou. Nahrazuje dřívější
 * samostatný "status" URL přepínač, který uměl být nekonzistentní s vybraným view (to byl
 * přesně ten nahlášený bug: "Aktivní" view neresetovalo nezávislý `?status=` parametr, takže
 * po přepnutí na Neaktivní/Vše a návratu na "Aktivní" view zůstaly vidět neaktivní záznamy).
 * Krátké generické labely (ne "Aktivní <entita>") schválně kvůli kompaktnímu vzhledu pilulek
 * v přepínači — entita je z kontextu stránky vždycky jasná.
 */
export function buildStatusViews(entity: EntityDefinition, template: ViewTemplate): ViewDefinition[] {
  const base = { entity: entity.name, columns: template.columns, defaultSort: template.defaultSort };

  return [
    {
      ...base,
      name: `active_${entity.table}`,
      label: "Aktivní",
      conditions: [{ field: "status", operator: "eq", value: "active" }],
    },
    {
      ...base,
      name: `inactive_${entity.table}`,
      label: "Neaktivní",
      conditions: [{ field: "status", operator: "eq", value: "inactive" }],
      overflow: true,
    },
    {
      ...base,
      name: `all_${entity.table}`,
      label: "Vše",
      conditions: [],
      overflow: true,
    },
  ];
}
