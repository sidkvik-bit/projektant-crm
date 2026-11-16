"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import { CUSTOM_RECORDS_TABLE } from "@/customization/merge";
import { customEntityBasePath } from "@/customization/registry";

// Záznamy vlastních entit firmy — jedna tabulka custom_records, entitu určuje entity_name.

export async function createCustomRecord(entityName: string, values: EntityFormValues) {
  return createEntityRecord(CUSTOM_RECORDS_TABLE, customEntityBasePath(entityName), { ...values, entity_name: entityName });
}

export async function updateCustomRecord(entityName: string, id: string, values: EntityFormValues) {
  // entity_name se po založení nemění — záznam nejde "přestěhovat" do jiné entity.
  const rest = { ...values };
  delete rest.entity_name;
  return updateEntityRecord(CUSTOM_RECORDS_TABLE, customEntityBasePath(entityName), id, rest);
}
