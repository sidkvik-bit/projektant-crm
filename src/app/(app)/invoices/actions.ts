"use server";

import { createEntityRecord, updateEntityRecord } from "@/engine/entityActions";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Invoice/Entity.json";

const BASE_PATH = "/invoices";

export async function createInvoice(values: EntityFormValues) {
  return createEntityRecord(entity.table, BASE_PATH, values);
}

export async function updateInvoice(id: string, values: EntityFormValues) {
  return updateEntityRecord(entity.table, BASE_PATH, id, values);
}
