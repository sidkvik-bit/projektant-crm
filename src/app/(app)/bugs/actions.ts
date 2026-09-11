"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Bug/Entity.json";

const BASE_PATH = "/bugs";

export async function createBug(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateBug(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}
