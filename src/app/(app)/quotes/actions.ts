"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";

const BASE_PATH = "/quotes";

export async function createQuote(values: EntityFormValues) {
  return createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateQuote(id: string, values: EntityFormValues) {
  return updateEntityRecord(entity.table, BASE_PATH, id, values);
}
