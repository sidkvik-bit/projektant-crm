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
        "Fulltextové vyhledávání napříč zájemci, obchodními vztahy, kontakty, projekty, nabídkami, fakturami a aktivitami. Použij, když uživatel hledá konkrétní záznam podle názvu nebo jména.",
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
        .select("id, name, status, status_reason_id, deadline, budget, accounts(name)")
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
            "id, name, status, status_reason_id, datum_zahajeni, deadline, budget, description, address_city, accounts(name)",
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
    "find_contact",
    {
      title: "Najít kontakt nebo firmu",
      description:
        "Vyhledá kontaktní osoby a obchodní vztahy podle jména, firmy nebo e-mailu — včetně kontaktních údajů.",
      inputSchema: z.object({ query: z.string().min(2) }),
    },
    async ({ query }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const pattern = `%${query}%`;
      const [contacts, accounts] = await Promise.all([
        session.supabase
          .from("contacts")
          .select("id, first_name, last_name, email, phone, mobile_phone, accounts(name)")
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
