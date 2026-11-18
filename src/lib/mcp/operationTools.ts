import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { describeInvoiceGeneration, invoiceConfirmUrl } from "@/lib/invoiceConfirmation";
import { fail, ok, resolveOptionValue, sessionFrom } from "./shared";

/**
 * Operace z webu, které nejsou obyčejné „ulož pole záznamu“: kvalifikace zájemce, položky nabídek
 * a faktur, úhrada faktury, tým projektu, upozornění na milníky, milníky šablon, hodnoty
 * číselníků, přečtení notifikací. Vše klientem přihlášeného uživatele (RLS).
 * Mazání dílčích záznamů jde přes request_delete (potvrzuje člověk), vystavení faktury přes
 * request_invoice_from_quote (taky potvrzuje člověk — vzniká účetní doklad s číslem z řady).
 */

const ITEM = {
  name: z.string().min(1),
  quantity: z.number().positive().default(1),
  unit: z.string().default("ks"),
  unit_price: z.number().min(0),
};

const ITEM_COLUMNS = "id, name, quantity, unit, unit_price, line_total";

const originOf = (ctx: { http?: { authInfo?: AuthInfo } }) => (ctx.http?.authInfo?.extra?.origin as string | undefined) ?? "";

/** Vloží řádek a vrátí ho; chyba z DB (RLS, FK) jde uživateli čitelně. */
async function insertRow(supabase: SupabaseClient, table: string, values: Record<string, unknown>, columns: string) {
  const { data, error } = await supabase.from(table).insert(values).select(columns).single();
  return error ? fail(`Uložení selhalo: ${error.message}`) : ok({ vytvoreno: data });
}

/** Upraví řádek a vrátí stav před a po. */
async function updateRow(
  supabase: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  columns: string,
) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return fail("Nebylo co změnit.");
  const { data: before } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
  if (!before) return fail("Záznam neexistuje nebo k němu nemáš přístup.");
  const { data: after, error } = await supabase.from(table).update(clean).eq("id", id).select(columns).single();
  return error ? fail(`Úprava selhala: ${error.message}`) : ok({ pred_zmenou: before, po_zmene: after });
}

function itemTools(server: McpServer, kind: "quote" | "invoice") {
  const table = `${kind}_items`;
  const parent = `${kind}_id`;
  const name = kind === "quote" ? "nabídky" : "faktury";

  server.registerTool(
    `add_${kind}_item`,
    {
      title: `Přidat položku ${name}`,
      description: `Přidá položku do ${name}. Cena za jednotku bez DPH.`,
      inputSchema: z.object({ [parent]: z.string().uuid(), ...ITEM }),
    },
    async (args, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { name: itemName, quantity, unit, unit_price } = args as z.infer<z.ZodObject<typeof ITEM>>;
      return insertRow(
        session.supabase,
        table,
        { [parent]: (args as unknown as Record<string, string>)[parent], name: itemName, quantity, unit: unit || "ks", unit_price },
        ITEM_COLUMNS,
      );
    },
  );

  server.registerTool(
    `update_${kind}_item`,
    {
      title: `Upravit položku ${name}`,
      description: `Upraví položku ${name} (název, množství, jednotka, cena za jednotku). Vrátí stav před a po.`,
      inputSchema: z.object({
        item_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        unit_price: z.number().min(0).optional(),
      }),
    },
    async ({ item_id, ...patch }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      return updateRow(session.supabase, table, item_id, patch, ITEM_COLUMNS);
    },
  );

  server.registerTool(
    `list_${kind}_items`,
    {
      title: `Položky ${name}`,
      description: `Vypíše položky ${name}.`,
      inputSchema: z.object({ [parent]: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    async (args, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data, error } = await session.supabase
        .from(table)
        .select(ITEM_COLUMNS)
        .eq(parent, (args as unknown as Record<string, string>)[parent])
        .order("sort_order");
      return error ? fail(error.message) : ok(data);
    },
  );
}

export function registerOperationTools(server: McpServer) {
  server.registerTool(
    "qualify_lead",
    {
      title: "Kvalifikovat zájemce",
      description:
        "Kvalifikuje zájemce stejně jako tlačítko ve webu: vznikne firma + kontakt, s create_project i projekt. Zájemce musí mít e-mail nebo telefon. Používej jen na výslovnou žádost uživatele.",
      inputSchema: z.object({ lead_id: z.string().uuid(), create_project: z.boolean().default(false) }),
    },
    async ({ lead_id, create_project }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data: lead } = await session.supabase.from("leads").select("name, email, phone").eq("id", lead_id).maybeSingle();
      if (!lead) return fail("Zájemce neexistuje nebo k němu nemáš přístup.");
      if (!lead.email && !lead.phone) {
        return fail("Zájemce nemá e-mail ani telefon — kontakt by byl nekontaktovatelný. Doplň aspoň jedno (update_lead).");
      }
      const { data, error } = await session.supabase.rpc("qualify_lead", { p_lead_id: lead_id, p_create_project: create_project });
      return error ? fail(`Kvalifikace selhala: ${error.message}`) : ok({ kvalifikovano: lead.name, vytvoreno: data });
    },
  );

  itemTools(server, "quote");
  itemTools(server, "invoice");

  server.registerTool(
    "set_invoice_paid",
    {
      title: "Označit fakturu jako uhrazenou",
      description: "Označí fakturu jako uhrazenou (datum úhrady = dnes, nebo zadané) nebo to vrátí. Vrátí stav před a po.",
      inputSchema: z.object({
        invoice_id: z.string().uuid(),
        paid: z.boolean(),
        paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Datum úhrady YYYY-MM-DD, výchozí dnes"),
      }),
    },
    async ({ invoice_id, paid, paid_on }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      return updateRow(
        session.supabase,
        "invoices",
        invoice_id,
        { uhrazeno: paid, datum_uhrady: paid ? (paid_on ?? new Date().toISOString().slice(0, 10)) : null },
        "id, name, uhrazeno, datum_uhrady",
      );
    },
  );

  server.registerTool(
    "request_invoice_from_quote",
    {
      title: "Připravit fakturu z nabídky",
      description:
        "Připraví vystavení faktury z nabídky (všechny nebo vybrané položky). NIC NEVYSTAVÍ: vrátí přehled a odkaz, na kterém uživatel fakturu sám vystaví — vzniká účetní doklad s číslem z řady. Odkaz uživateli pošli.",
      inputSchema: z.object({
        quote_id: z.string().uuid(),
        item_ids: z.array(z.string().uuid()).optional().describe("Jen tyto položky (list_quote_items); bez = všechny"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ quote_id, item_ids }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const preview = await describeInvoiceGeneration(session.supabase, session.userId, quote_id, item_ids);
      if (!preview.ok) return fail(preview.error);
      return ok({
        nabidka: preview.value.quoteName,
        polozky: preview.value.items,
        celkem_bez_dph: preview.value.total,
        potvrzeni: invoiceConfirmUrl(originOf(ctx), preview.value),
        dalsi_krok: "Faktura ještě nevznikla. Pošli uživateli odkaz — vystaví ji on kliknutím v CRM.",
      });
    },
  );

  server.registerTool(
    "add_project_member",
    {
      title: "Přidat člověka do týmu projektu",
      description: "Přidá kontakt do týmu / subdodavatelů projektu, volitelně s rolí (název z číselníku profese, např. Statik).",
      inputSchema: z.object({ project_id: z.string().uuid(), contact_id: z.string().uuid(), role: z.string().optional() }),
    },
    async ({ project_id, contact_id, role }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let roleId: string | null = null;
      if (role) {
        const match = await resolveOptionValue(session.supabase, "profese", role);
        if ("available" in match) return fail(`Role "${role}" neexistuje. Možnosti: ${match.available.join(", ")}.`);
        roleId = match.value.id;
      }
      return insertRow(
        session.supabase,
        "project_contacts",
        { project_id, contact_id, role_id: roleId },
        "id, project_id, contact_id, role_id",
      );
    },
  );

  server.registerTool(
    "set_milestone_notification",
    {
      title: "Nastavit upozornění na milník",
      description: "Nastaví upozornění X dní před termínem milníku (e-mail nebo v aplikaci). Příjemce výchozí = ty.",
      inputSchema: z.object({
        milestone_id: z.string().uuid(),
        type: z.enum(["EMAIL", "PUSH"]).describe("EMAIL = e-mail, PUSH = upozornění v aplikaci"),
        days_before: z.number().int().min(0).max(365),
        recipient_user_id: z.string().uuid().optional(),
      }),
    },
    async ({ milestone_id, type, days_before, recipient_user_id }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      return insertRow(
        session.supabase,
        "notifications_config",
        { milestone_id, type, dni_predem: days_before, recipient_user_id: recipient_user_id ?? session.userId },
        "id, milestone_id, type, dni_predem, recipient_user_id",
      );
    },
  );

  server.registerTool(
    "add_template_milestone",
    {
      title: "Přidat milník do šablony",
      description: "Přidá milník do šablony projektu (offset = dní od zahájení projektu).",
      inputSchema: z.object({
        template_id: z.string().uuid(),
        name: z.string().min(1),
        offset_days: z.number().int(),
        description: z.string().optional(),
      }),
    },
    async ({ template_id, name, offset_days, description }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      return insertRow(
        session.supabase,
        "template_milestones",
        { template_id, name, offset_dni: offset_days, description: description?.trim() || null },
        "id, template_id, name, offset_dni, description",
      );
    },
  );

  server.registerTool(
    "list_option_sets",
    {
      title: "Číselníky",
      description: "Vypíše číselníky firmy a jejich hodnoty (i neaktivní), volitelně jen jeden podle klíče.",
      inputSchema: z.object({ key: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ key }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("option_sets")
        .select("id, key, label, option_set_values(id, label, value_key, is_active, sort_order)")
        .order("key");
      if (key) query = query.eq("key", key);
      const { data, error } = await query;
      return error ? fail(error.message) : ok(data);
    },
  );

  server.registerTool(
    "add_option_set_value",
    {
      title: "Přidat hodnotu číselníku",
      description: "Přidá novou hodnotu do číselníku (např. novou fázi projektu nebo profesi). Klíč číselníku z list_option_sets.",
      inputSchema: z.object({ option_set_key: z.string(), label: z.string().min(1) }),
    },
    async ({ option_set_key, label }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data: set } = await session.supabase
        .from("option_sets")
        .select("id, option_set_values(sort_order)")
        .eq("key", option_set_key)
        .maybeSingle();
      if (!set) return fail(`Číselník "${option_set_key}" neexistuje.`);
      const orders = ((set.option_set_values ?? []) as { sort_order: number }[]).map((v) => v.sort_order);
      const valueKey =
        label
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || `hodnota_${Date.now()}`;
      return insertRow(
        session.supabase,
        "option_set_values",
        { option_set_id: set.id, value_key: valueKey, label, sort_order: Math.max(0, ...orders) + 1 },
        "id, label, value_key, sort_order, is_active",
      );
    },
  );

  server.registerTool(
    "set_option_set_value_active",
    {
      title: "Zapnout / vypnout hodnotu číselníku",
      description: "Deaktivuje hodnotu číselníku (zmizí z výběru, stará data zůstanou) nebo ji znovu zapne.",
      inputSchema: z.object({ value_id: z.string().uuid(), active: z.boolean() }),
    },
    async ({ value_id, active }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      return updateRow(session.supabase, "option_set_values", value_id, { is_active: active }, "id, label, is_active");
    },
  );

  server.registerTool(
    "list_notifications",
    {
      title: "Moje upozornění",
      description: "Vypíše moje upozornění v aplikaci (výchozí jen nepřečtená).",
      inputSchema: z.object({ include_read: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_read }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase.from("notifications").select("id, message, milestone_id, is_read, created_at").eq("user_id", session.userId).order("created_at", { ascending: false }).limit(50);
      if (!include_read) query = query.eq("is_read", false);
      const { data, error } = await query;
      return error ? fail(error.message) : ok(data);
    },
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Označit upozornění jako přečtená",
      description: "Označí vybraná upozornění (nebo všechna moje nepřečtená) jako přečtená.",
      inputSchema: z.object({ ids: z.array(z.string().uuid()).optional().describe("Bez = všechna") }),
    },
    async ({ ids }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase.from("notifications").update({ is_read: true }).eq("user_id", session.userId).eq("is_read", false);
      if (ids?.length) query = query.in("id", ids);
      const { data, error } = await query.select("id");
      return error ? fail(error.message) : ok({ oznaceno: data?.length ?? 0 });
    },
  );
}
