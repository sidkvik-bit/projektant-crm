import type { ResolvedCommand } from "../merge";
import type { FormEvents } from "../types";

/** Úpravy firmy, které potřebuje klientský FormEngine / seznam — jen serializovatelná data. */
export interface ClientCustomization {
  /** Logický název entity (pro ctx.entity a pluginy tlačítek). */
  entity: string;
  commands: ResolvedCommand[];
  /** Kód skriptů podle klíče (vlastní entity + sdílené '*'). */
  scripts: Record<string, string>;
  events?: FormEvents;
  /** Cesty na detail záznamů vlastních entit (lookupy, Zavřít…). */
  basePaths: Record<string, string>;
}
