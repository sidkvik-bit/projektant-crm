import type { EntityDefinition } from "@/engine/types";

import Lead from "./Entities/Lead/Entity.json";
import Account from "./Entities/Account/Entity.json";
import Contact from "./Entities/Contact/Entity.json";
import ProjectTemplate from "./Entities/ProjectTemplate/Entity.json";
import Project from "./Entities/Project/Entity.json";
import Activity from "./Entities/Activity/Entity.json";

/**
 * Jediné místo, které vyjmenovává všechny importovatelné entity. Přidání
 * nové entity do importu = jeden řádek sem (+ do registry.ts, pokud má být
 * i cílem lookupu odjinud). ImportWizard z tohohle seznamu čte pole i
 * tabulku — žádná další ruční stránka/akce se pro import nepíše.
 */
export const importableEntities: EntityDefinition[] = [
  Lead,
  Account,
  Contact,
  ProjectTemplate,
  Project,
  Activity,
] as EntityDefinition[];
