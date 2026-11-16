import { createClient } from "@/lib/supabase/server";
import { FormEngine, type FormEngineProps } from "@/engine/FormEngine";
import type { ClientCustomization } from "./client/types";
import { unfoldCustomValues } from "./customValues";
import { loadMissingFieldOptions } from "./fieldOptions";
import { commandsFor, effectiveEntity, effectiveForm, formEvents, scriptsFor, type CustomizationSet } from "./merge";
import { customEntityBasePaths } from "./registry";
import { getCustomizations } from "./repository";

/** Data pro klientský FormEngine z vrstvy úprav — sdílí ho formulář i seznam. */
export function clientCustomization(entityName: string, set: CustomizationSet): ClientCustomization {
  return {
    entity: entityName,
    commands: commandsFor(entityName, "form", set),
    scripts: scriptsFor(entityName, set),
    events: formEvents(entityName, set),
    basePaths: customEntityBasePaths(set),
  };
}

/**
 * FormEngine s úpravami firmy: vlastní pole, přepis formuláře, tlačítka a skripty. Stránky
 * ho používají místo FormEngine se stejnými props — o úpravách firmy nemusí nic vědět.
 * Pro vlastní entity přichází `entity` už sestavená (customEntityDefinition), úprava je tedy
 * idempotentní.
 */
export async function CustomizedFormEngine(props: FormEngineProps) {
  const set = await getCustomizations();
  if (set.isEmpty) return <FormEngine {...props} />;

  const entity = effectiveEntity(props.entity, set);
  const form = effectiveForm(props.form, entity, set);
  const supabase = await createClient();
  const extra = await loadMissingFieldOptions(supabase, entity.fields, set, {
    optionSetKeys: Object.keys(props.optionSetValues ?? {}),
    lookupTargets: Object.keys(props.lookupOptions ?? {}),
  });

  return (
    <FormEngine
      {...props}
      entity={entity}
      form={form}
      defaultValues={props.defaultValues ? unfoldCustomValues(props.defaultValues) : undefined}
      optionSetValues={{ ...extra.optionSetValues, ...props.optionSetValues }}
      lookupOptions={{ ...extra.lookupOptions, ...props.lookupOptions }}
      customization={clientCustomization(entity.name, set)}
    />
  );
}
