import type { SupabaseClient } from "@supabase/supabase-js";
import { createRecord, getRecordById, updateRecord } from "@/engine/Database";
import { dbColumnRef, unfoldCustomValues } from "./customValues";
import { CUSTOM_RECORDS_TABLE, type CustomizationSet } from "./merge";
import { resolveEntityRef } from "./registry";

// Jediné API, přes které skripty (prohlížeč) i pluginy (server) sahají na data. Běží vždy
// s klientem přihlášeného uživatele, takže RLS ho drží v jeho firmě, a jen nad obchodními
// entitami z registru (+ vlastními) — žádné systémové tabulky (users, organizations, tokeny…).
// Mazání záměrně chybí: skript ani plugin nemá jak tiše odstranit data.

export interface QueryOptions {
  /** Rovnost na pole (i vlastní new_…). null = pole je prázdné. */
  filter?: Record<string, string | number | boolean | null>;
  orderBy?: { field: string; direction?: "asc" | "desc" };
  /** Max. 500, výchozí 50. */
  limit?: number;
}

export interface DataApi {
  retrieve(entity: string, id: string): Promise<Record<string, unknown> | null>;
  query(entity: string, options?: QueryOptions): Promise<Record<string, unknown>[]>;
  create(entity: string, values: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(entity: string, id: string, values: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const FIELD = /^[A-Za-z0-9_]{1,64}$/;

export function createDataApi(supabase: SupabaseClient, set: CustomizationSet): DataApi {
  function table(entity: string) {
    if (entity === "User") throw new Error("Entita User je jen pro čtení přes lookupy, ne přes API");
    const ref = resolveEntityRef(String(entity), set);
    if (!ref) throw new Error(`Neznámá entita "${entity}"`);
    return ref;
  }

  return {
    async retrieve(entity, id) {
      const ref = table(entity);
      const row = await getRecordById<Record<string, unknown>>(supabase, ref.table, String(id)).catch(() => null);
      if (!row || (ref.filter && row.entity_name !== ref.filter.entity_name)) return null;
      return row;
    },

    async query(entity, options = {}) {
      const ref = table(entity);
      let query = supabase.from(ref.table).select("*");
      for (const [column, value] of Object.entries({ ...options.filter, ...ref.filter })) {
        if (!FIELD.test(column)) throw new Error(`Neplatné pole "${column}"`);
        query = value === null ? query.is(dbColumnRef(column), null) : query.eq(dbColumnRef(column), value);
      }
      if (options.orderBy) {
        if (!FIELD.test(options.orderBy.field)) throw new Error(`Neplatné pole "${options.orderBy.field}"`);
        query = query.order(dbColumnRef(options.orderBy.field), { ascending: options.orderBy.direction !== "desc" });
      }
      query = query.limit(Math.min(Math.max(1, Number(options.limit) || 50), 500));
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => unfoldCustomValues(row as Record<string, unknown>));
    },

    async create(entity, values) {
      const ref = table(entity);
      const payload = ref.table === CUSTOM_RECORDS_TABLE ? { ...values, entity_name: entity } : values;
      return createRecord<Record<string, unknown>>(supabase, ref.table, payload);
    },

    async update(entity, id, values) {
      const ref = table(entity);
      const rest = { ...values };
      delete rest.entity_name;
      if (ref.filter) {
        const existing = await this.retrieve(entity, id);
        if (!existing) throw new Error(`Záznam ${id} entity ${entity} neexistuje`);
      }
      return updateRecord<Record<string, unknown>>(supabase, ref.table, String(id), rest);
    },
  };
}
