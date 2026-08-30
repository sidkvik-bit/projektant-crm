"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";

const BASE_PATH = "/accounts";

export async function createAccount(values: EntityFormValues) {
  await createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateAccount(id: string, values: EntityFormValues) {
  await updateEntityRecord(entity.table, BASE_PATH, id, values);
}
