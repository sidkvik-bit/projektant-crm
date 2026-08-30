"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Contact/Entity.json";

const BASE_PATH = "/contacts";

export async function createContact(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateContact(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}
