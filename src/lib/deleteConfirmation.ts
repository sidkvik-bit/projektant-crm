import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteRecord } from "@/engine/Database";
import { returnPluginError } from "@/customization/plugins";
import { resolveEntityRef } from "@/customization/registry";
import { listComponentRows, toCustomizationSet } from "@/customization/repository";

// Mazání, které připraví AI (MCP), ale provede jen člověk ve webu na /potvrdit-smazani.
// AI tedy smazat nic nemůže — dostane jen odkaz. Kód v odkazu váže potvrzení na stav záznamu:
// když se mezitím změní, odkaz přestane platit a člověk uvidí aktuální přehled znovu.

interface Cascade {
  table: string;
  column: string;
  label: string;
  children?: Cascade[];
}

const INVOICES: Cascade = { table: "invoices", column: "project_id", label: "Faktury" };

/** Co se smaže s rodičem (on delete cascade v migracích). */
const CASCADES: Record<string, Cascade[]> = {
  accounts: [
    { table: "contacts", column: "account_id", label: "Kontakty" },
    {
      table: "projects",
      column: "account_id",
      label: "Projekty",
      children: [{ table: "quotes", column: "project_id", label: "Nabídky" }, INVOICES],
    },
  ],
  projects: [
    { table: "project_milestones", column: "project_id", label: "Milníky" },
    { table: "quotes", column: "project_id", label: "Nabídky" },
    INVOICES,
    { table: "project_parcels", column: "project_id", label: "Parcely" },
  ],
  quotes: [
    { table: "quote_phases", column: "quote_id", label: "Fáze nabídky" },
    { table: "quote_items", column: "quote_id", label: "Položky nabídky" },
  ],
  invoices: [{ table: "invoice_items", column: "invoice_id", label: "Položky faktury" }],
  project_templates: [{ table: "template_milestones", column: "template_id", label: "Milníky šablony" }],
  project_milestones: [{ table: "notifications_config", column: "milestone_id", label: "Upozornění na milník" }],
};

interface DeletableRef {
  table: string;
  labelFields: string[];
  basePath: string | null;
  filter?: Record<string, string>;
  /** Dílčí záznam: po smazání se vrací na detail rodiče. */
  parent?: { column: string; basePath: string };
}

/** Dílčí záznamy, které nejsou samostatné entity, ale ve webu jdou smazat (řádky na detailu). */
const SUB_RECORDS: Record<string, DeletableRef> = {
  ProjectMilestone: { table: "project_milestones", labelFields: ["name"], basePath: null, parent: { column: "project_id", basePath: "/projects" } },
  ProjectMember: { table: "project_contacts", labelFields: ["contact_id"], basePath: null, parent: { column: "project_id", basePath: "/projects" } },
  QuotePhase: { table: "quote_phases", labelFields: ["nazev"], basePath: null, parent: { column: "quote_id", basePath: "/quotes" } },
  QuoteItem: { table: "quote_items", labelFields: ["name"], basePath: null, parent: { column: "quote_id", basePath: "/quotes" } },
  InvoiceItem: { table: "invoice_items", labelFields: ["name"], basePath: null, parent: { column: "invoice_id", basePath: "/invoices" } },
  TemplateMilestone: { table: "template_milestones", labelFields: ["name"], basePath: null, parent: { column: "template_id", basePath: "/project-templates" } },
  ProjectParcel: { table: "project_parcels", labelFields: ["parcelni_cislo", "katastralni_uzemi"], basePath: null, parent: { column: "project_id", basePath: "/projects" } },
  MilestoneNotification: { table: "notifications_config", labelFields: ["type", "dni_predem"], basePath: null },
};

export const DELETABLE_SUB_RECORDS = Object.keys(SUB_RECORDS);

export interface DeletionPreview {
  entity: string;
  id: string;
  table: string;
  /** Seznam záznamů entity — kam se po smazání vrátit. */
  basePath: string | null;
  label: string;
  /** Navázané záznamy, které zmizí spolu s ním. */
  cascades: { label: string; count: number }[];
  /** Smaže se i vystavená faktura (účetní doklad). */
  touchesInvoices: boolean;
  code: string;
}

export type DeletionResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function countCascades(
  supabase: SupabaseClient,
  cascades: Cascade[],
  parentIds: string[],
  out: Map<string, number>,
): Promise<void> {
  for (const cascade of cascades) {
    const { data, error } = await supabase.from(cascade.table).select("id").in(cascade.column, parentIds);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) out.set(cascade.label, (out.get(cascade.label) ?? 0) + ids.length);
    if (ids.length && cascade.children) await countCascades(supabase, cascade.children, ids, out);
  }
}

const confirmationCode = (parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);

/** Co by se smazalo. Nic nemaže. */
export async function describeDeletion(
  supabase: SupabaseClient,
  userId: string,
  entity: string,
  id: string,
): Promise<DeletionResult<DeletionPreview>> {
  const ref: DeletableRef | null =
    SUB_RECORDS[entity] ?? resolveEntityRef(entity, toCustomizationSet(await listComponentRows(supabase), false));
  if (!ref || ref.table === "users") return { ok: false, error: `Entitu "${entity}" nejde mazat.` };

  const columns = ["id", "updated_at", ...ref.labelFields, ...(ref.parent ? [ref.parent.column] : [])];
  let query = supabase.from(ref.table).select(columns.join(", ")).eq("id", id);
  if (ref.filter) query = query.match(ref.filter);
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Záznam neexistuje nebo k němu nemáš přístup." };
  const row = data as unknown as Record<string, unknown>;

  const counts = new Map<string, number>();
  await countCascades(supabase, CASCADES[ref.table] ?? [], [id], counts);
  const label = ref.labelFields.map((f) => row[f]).filter(Boolean).join(" ") || id;

  return {
    ok: true,
    value: {
      entity,
      id,
      table: ref.table,
      basePath: ref.parent ? `${ref.parent.basePath}/${row[ref.parent.column]}` : ref.basePath,
      label,
      cascades: [...counts].map(([l, count]) => ({ label: l, count })),
      touchesInvoices: ref.table === "invoices" || counts.has(INVOICES.label),
      code: confirmationCode([entity, id, String(row.updated_at), userId]),
    },
  };
}

/** Odkaz, na kterém člověk smazání potvrdí. */
export function deletionConfirmUrl(origin: string, preview: DeletionPreview): string {
  const params = new URLSearchParams({ entity: preview.entity, id: preview.id, v: preview.code });
  return `${origin}/potvrdit-smazani?${params}`;
}

/** Smaže záznam — volá jen web po kliknutí člověka. Kód musí sedět s aktuálním stavem. */
export async function deleteConfirmed(
  supabase: SupabaseClient,
  userId: string,
  entity: string,
  id: string,
  code: string,
): Promise<DeletionResult<DeletionPreview>> {
  const preview = await describeDeletion(supabase, userId, entity, id);
  if (!preview.ok) return preview;
  if (preview.value.code !== code) {
    return { ok: false, error: "Záznam se mezitím změnil. Zkontroluj přehled znovu a potvrď ho." };
  }
  const deleted = await returnPluginError(() => deleteRecord(supabase, preview.value.table, id));
  if (deleted && "error" in deleted) return { ok: false, error: deleted.error };
  return preview;
}
