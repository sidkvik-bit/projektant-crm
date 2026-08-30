"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";

const BASE_PATH = "/leads";

export async function createLead(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateLead(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}
