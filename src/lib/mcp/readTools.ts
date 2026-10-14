import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MAX_ROWS, fail, ok, optionLabelMap, sessionFrom, withStageLabel } from "./shared";

/**
 * Čtecí nástroje MCP serveru. Všechny sahají na data přes `session.supabase`, tedy pod identitou
 * volajícího uživatele — izolaci organizací drží RLS v Postgresu, ne tenhle soubor.
 *
 * Záznamy se vracejí VČETNĚ `id`, protože zápisové nástroje (viz writeTools.ts) jimi adresují,
 * co upravit: model si nejdřív přečte "milník Studie, id …", pak ho označí za splněný.
 */
export function registerReadTools(server: McpServer) {
  server.registerTool(
    "search_crm",
    {
      title: "Hledat v CRM",
      description:
        "Fulltextové vyhledávání napříč zájemci, firmami, kontakty, projekty, nabídkami, fakturami a aktivitami. Použij, když uživatel hledá konkrétní záznam podle názvu nebo jména.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Hledaný výraz, např. 'Novák' nebo 'rekonstrukce'"),
      }),
    },
    async ({ query }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data, error } = await session.supabase.rpc("global_search", {
        q: query,
        result_limit: MAX_ROWS,
      });
      if (error) return fail(`Hledání selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "Seznam projektů",
      description:
        "Vrátí projekty organizace včetně klienta, fáze a termínu. Volitelně jen aktivní. Použij pro přehledové otázky typu 'jaké mám rozjeté zakázky'.",
      inputSchema: z.object({
        only_active: z.boolean().default(true).describe("Jen aktivní projekty"),
        limit: z.number().int().min(1).max(MAX_ROWS).default(20),
      }),
    },
    async ({ only_active, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("projects")
        .select("id, name, status, status_reason_id, deadline, budget, klient:contacts!projects_primary_contact_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (only_active) query = query.eq("status", "active");
      const [{ data, error }, stages] = await Promise.all([
        query,
        optionLabelMap(session.supabase, "project_status_reason"),
      ]);
      if (error) return fail(`Načtení projektů selhalo: ${error.message}`);
      const decorate = withStageLabel(stages);
      return ok((data ?? []).map((row) => decorate(row as Record<string, unknown>)));
    },
  );

  server.registerTool(
    "get_project_detail",
    {
      title: "Detail projektu",
      description:
        "Vrátí jeden projekt včetně fáze, milníků, nabídek a posledních aktivit. Použij, když se uživatel ptá na konkrétní zakázku — a taky předtím, než budeš projekt nebo jeho milník upravovat, ať víš, co v něm je.",
      inputSchema: z.object({ project_id: z.string().uuid() }),
    },
    async ({ project_id }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const [project, milestones, quotes, activities, stages] = await Promise.all([
        session.supabase
          .from("projects")
          .select(
            "id, name, status, status_reason_id, datum_zahajeni, deadline, budget, description, address_city, klient:contacts!projects_primary_contact_id_fkey(first_name, last_name)",
          )
          .eq("id", project_id)
          .maybeSingle(),
        session.supabase
          .from("project_milestones")
          .select("id, name, termin_splneni, splneno")
          .eq("project_id", project_id)
          .order("termin_splneni"),
        session.supabase.from("quotes").select("id, number, name, total, status").eq("project_id", project_id),
        session.supabase
          .from("activities")
          .select("id, subject, activity_date")
          .eq("entity_type", "Project")
          .eq("entity_id", project_id)
          .order("activity_date", { ascending: false })
          .limit(10),
        optionLabelMap(session.supabase, "project_status_reason"),
      ]);
      if (!project.data) return fail("Projekt nenalezen (nebo k němu nemáš přístup).");
      return ok({
        projekt: withStageLabel(stages)(project.data as Record<string, unknown>),
        milniky: milestones.data ?? [],
        nabidky: quotes.data ?? [],
        posledni_aktivity: activities.data ?? [],
      });
    },
  );

  server.registerTool(
    "upcoming_deadlines",
    {
      title: "Blížící se termíny",
      description:
        "Nesplněné milníky s termínem v následujících N dnech, plus vše po termínu. Použij pro otázky typu 'co mi hoří' nebo 'co mám tento týden'.",
      inputSchema: z.object({
        days_ahead: z.number().int().min(1).max(365).default(14),
      }),
    },
    async ({ days_ahead }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const until = new Date();
      until.setDate(until.getDate() + days_ahead);
      const { data, error } = await session.supabase
        .from("project_milestones")
        .select("id, name, termin_splneni, projects(name)")
        .eq("splneno", false)
        .not("termin_splneni", "is", null)
        .lte("termin_splneni", until.toISOString().slice(0, 10))
        .order("termin_splneni");
      if (error) return fail(`Načtení termínů selhalo: ${error.message}`);
      const today = new Date().toISOString().slice(0, 10);
      const rows = (data ?? []) as unknown as { termin_splneni: string }[];
      return ok({
        po_terminu: rows.filter((m) => m.termin_splneni < today),
        nadchazejici: rows.filter((m) => m.termin_splneni >= today),
      });
    },
  );

  server.registerTool(
    "list_leads",
    {
      title: "Seznam zájemců",
      description: "Vrátí zájemce (poptávky) organizace, ve výchozím stavu jen aktivní.",
      inputSchema: z.object({
        only_active: z.boolean().default(true),
        limit: z.number().int().min(1).max(MAX_ROWS).default(20),
      }),
    },
    async ({ only_active, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("leads")
        .select("id, name, company_name, email, phone, demand_description, expected_value, status")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (only_active) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) return fail(`Načtení zájemců selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_contacts",
    {
      title: "Seznam kontaktů",
      description:
        "Vypíše kontaktní osoby organizace, nejnovější první. Použij na otázky typu 'vypiš mi všechny kontakty'; na hledání konkrétního člověka je rychlejší find_contact.",
      inputSchema: z.object({
        account_id: z.string().uuid().optional().describe("Jen kontakty této firmy"),
        only_active: z.boolean().default(true),
        limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
      }),
    },
    async ({ account_id, only_active, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, email, phone, mobile_phone, status, address_street, address_house_number, address_city, address_zip, address_country, accounts(name)",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (account_id) query = query.eq("account_id", account_id);
      if (only_active) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) return fail(`Načtení kontaktů selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "Seznam firem",
      description: "Vypíše firmy/klienty organizace, nejnovější první.",
      inputSchema: z.object({
        only_active: z.boolean().default(true),
        limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
      }),
    },
    async ({ only_active, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("accounts")
        .select("id, name, ico, email, phone, address_city, status")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (only_active) query = query.eq("status", "active");
      const { data, error } = await query;
      if (error) return fail(`Načtení firem selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_quotes",
    {
      title: "Seznam nabídek",
      description: "Vypíše nabídky včetně částek a projektu, ke kterému patří.",
      inputSchema: z.object({
        project_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
      }),
    },
    async ({ project_id, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("quotes")
        .select("id, number, name, total, valid_until, status, projects(name), klient:contacts!quotes_contact_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (project_id) query = query.eq("project_id", project_id);
      const { data, error } = await query;
      if (error) return fail(`Načtení nabídek selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_invoices",
    {
      title: "Seznam faktur",
      description:
        "Vypíše faktury včetně částek, splatnosti a toho, jestli jsou uhrazené. Použij na otázky typu 'co mám nezaplaceného' — s unpaid_only=true.",
      inputSchema: z.object({
        unpaid_only: z.boolean().default(false).describe("Jen neuhrazené"),
        project_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
      }),
    },
    async ({ unpaid_only, project_id, limit }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      let query = session.supabase
        .from("invoices")
        .select(
          "id, number, name, total, datum_vystaveni, datum_splatnosti, uhrazeno, projects(name), klient:contacts!invoices_contact_id_fkey(first_name, last_name)",
        )
        .order("datum_vystaveni", { ascending: false })
        .limit(limit);
      if (unpaid_only) query = query.eq("uhrazeno", false);
      if (project_id) query = query.eq("project_id", project_id);
      const { data, error } = await query;
      if (error) return fail(`Načtení faktur selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "find_contact",
    {
      title: "Najít kontakt nebo firmu",
      description:
        "Vyhledá kontaktní osoby a firmy podle jména, firmy nebo e-mailu — včetně kontaktních údajů.",
      inputSchema: z.object({ query: z.string().min(2) }),
    },
    async ({ query }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const pattern = `%${query}%`;
      const [contacts, accounts] = await Promise.all([
        session.supabase
          .from("contacts")
          .select(
            "id, first_name, last_name, email, phone, mobile_phone, address_city, accounts(name)",
          )
          .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(20),
        session.supabase
          .from("accounts")
          .select("id, name, ico, email, phone, website")
          .or(`name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(20),
      ]);
      return ok({ kontakty: contacts.data ?? [], obchodni_vztahy: accounts.data ?? [] });
    },
  );
}
