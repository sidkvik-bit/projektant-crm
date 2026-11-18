import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createRecord, updateRecord } from "@/engine/Database";
import { returnPluginError } from "@/customization/plugins";
import { formatContactName } from "@/engine/contacts";
import { addMonths, formatClientLine } from "@/lib/quoteDocument";
import {
  appendQuotePhases,
  listQuotePhases,
  phasesFromTemplates,
  replaceQuotePhases,
  type NewQuotePhase,
} from "@/lib/quotePhases";
import { resolveSupplierProfile } from "@/lib/supplierProfiles";
import { DATE_PATTERN, fail, ok, sessionFrom, unsavedFields } from "./shared";

/**
 * Cenové nabídky po fázích (create_quote, update_quote, get_quote_detail) a co k nim model
 * potřebuje vědět (šablony fází, profily dodavatele). Stejná pravidla jako writeTools.ts:
 * jeden záznam na volání, pevný seznam polí, běží pod identitou uživatele (RLS + audit).
 */

/** Fáze buď ze šablony (template: "STU", ostatní pole ji přepíšou), nebo celá vlastní. */
export const QUOTE_PHASE_INPUT = z
  .strictObject({
    template: z.string().optional().describe("Zkratka šablony fáze: PAS, STU, DSP… (viz list_quote_phase_templates)"),
    nazev: z.string().min(1).optional().describe("Název fáze; u šablony ho přepíše"),
    odrazky: z.array(z.string()).optional().describe("Odrážky s obsahem fáze; u šablony je nahradí"),
    cena: z.number().min(0).optional().describe("Cena fáze v Kč (bez DPH u plátce)"),
  })
  .refine((p) => p.template || p.nazev, { message: "Fáze potřebuje template nebo nazev." });

type QuotePhaseInput = z.infer<typeof QUOTE_PHASE_INPUT>;

async function buildPhases(supabase: SupabaseClient, inputs: QuotePhaseInput[]): Promise<NewQuotePhase[]> {
  const codes = inputs.filter((p) => p.template).map((p) => p.template!);
  const fromTemplates = codes.length ? await phasesFromTemplates(supabase, codes) : [];
  let t = 0;
  return inputs.map((p) => {
    const base = p.template ? fromTemplates[t++] : { kod: null, nazev: "", odrazky: [], cena: 0 };
    return {
      kod: base.kod,
      nazev: p.nazev ?? base.nazev,
      odrazky: p.odrazky ?? base.odrazky,
      cena: p.cena ?? base.cena,
    };
  });
}

async function resolveProfileId(supabase: SupabaseClient, input: string | undefined) {
  if (input === undefined) return { id: (await resolveSupplierProfile(supabase, "quote", null))?.id ?? null };
  const { data, error } = await supabase.from("supplier_profiles").select("id, nazev, jmeno");
  if (error) return { error: `Načtení profilů dodavatele selhalo: ${error.message}` };
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  const match = (data ?? []).find((p) => p.id === input || norm(p.nazev) === norm(input) || norm(p.jmeno) === norm(input));
  if (match) return { id: match.id as string };
  const names = (data ?? []).map((p) => p.nazev).join(", ") || "(žádné — založ je v Nastavení → Profily dodavatele)";
  return { error: `Profil dodavatele "${input}" neznám. Platné profily: ${names}.` };
}

async function quoteDetail(supabase: SupabaseClient, quoteId: string) {
  const [{ data: quote, error }, phases] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, number, name, nazev_stavby, zadavatel_text, valid_until, poznamky, zobrazit_soucet, total, je_platce_dph, project_id, contact_id, dodavatel:supplier_profiles(id, nazev, jmeno)",
      )
      .eq("id", quoteId)
      .maybeSingle(),
    listQuotePhases(supabase, quoteId),
  ]);
  if (error) throw error;
  if (!quote) return null;
  return {
    ...quote,
    faze: phases.map(({ kod, nazev, odrazky, cena }) => ({ kod, nazev, odrazky, cena })),
    pdf: `/api/quotes/${quoteId}/pdf`,
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err)));

export function registerQuoteTools(server: McpServer) {
  server.registerTool(
    "list_quote_phase_templates",
    {
      title: "Šablony fází nabídek",
      description:
        "Vypíše šablony fází pro cenové nabídky (zkratka PAS/STU/DSP…, název, odrážky, cena). Použij před create_quote.",
      inputSchema: z.object({}),
    },
    async (_input, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data, error } = await session.supabase
        .from("quote_phase_templates")
        .select("kod, nazev, odrazky, cena")
        .order("sort_order");
      if (error) return fail(`Načtení šablon fází selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "list_supplier_profiles",
    {
      title: "Profily dodavatele",
      description: "Vypíše profily dodavatele (kdo vystavuje nabídky a faktury) a který je výchozí.",
      inputSchema: z.object({}),
    },
    async (_input, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const { data, error } = await session.supabase
        .from("supplier_profiles")
        .select("id, nazev, jmeno, ico, je_platce_dph, pouzit_pro_nabidky, pouzit_pro_faktury")
        .order("created_at");
      if (error) return fail(`Načtení profilů selhalo: ${error.message}`);
      return ok(data);
    },
  );

  server.registerTool(
    "get_quote_detail",
    {
      title: "Detail nabídky",
      description: "Vrátí cenovou nabídku včetně fází, dodavatele, poznámek a odkazu na PDF. Použij před update_quote.",
      inputSchema: z.object({ quote_id: z.string().uuid() }),
    },
    async ({ quote_id }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      try {
        const detail = await quoteDetail(session.supabase, quote_id);
        return detail ? ok(detail) : fail("Nabídka nenalezena (nebo k ní nemáš přístup).");
      } catch (err) {
        return fail(`Načtení nabídky selhalo: ${errorText(err)}`);
      }
    },
  );

  server.registerTool(
    "create_quote",
    {
      title: "Založit cenovou nabídku",
      description:
        "Založí cenovou nabídku k zakázce: fáze (ze šablon PAS/STU/DSP nebo vlastní, s cenou), název stavby, zadavatel, dodavatel (profil), platnost a poznámky. Co neuvedeš, předvyplní se jako ve webu (výchozí profil dodavatele, jeho poznámky a platnost, klient zakázky). Číslo CN-RRRR-NNN se přidělí samo. Zakládej jen na výslovnou žádost uživatele.",
      inputSchema: z.strictObject({
        project_id: z.string().uuid(),
        contact_id: z.string().uuid().optional().describe("Objednatel; když chybí, vezme se klient zakázky"),
        nazev_stavby: z.string().min(1).describe("Tiskne se jako Název, např. 'Stavební úpravy objektu Doubravice 101, Hrubá Skála'"),
        name: z.string().min(1).optional().describe("Interní název nabídky v CRM; výchozí 'Cenová nabídka – <zakázka>'"),
        number: z.string().min(1).optional().describe("Jen když uživatel chce vlastní číslo; jinak se přidělí samo"),
        zadavatel_text: z.string().optional().describe("Řádek Zadavatel (jméno, adresa); výchozí z objednatele"),
        supplier_profile: z.string().optional().describe("Profil dodavatele (název, jméno nebo id); výchozí profil pro nabídky"),
        phases: z.array(QUOTE_PHASE_INPUT).min(1),
        valid_until: z.string().regex(DATE_PATTERN).optional().describe("YYYY-MM-DD; výchozí podle profilu (3 měsíce)"),
        poznamky: z.array(z.string()).optional().describe("Poznámky pod fázemi; výchozí z profilu dodavatele"),
        zobrazit_soucet: z.boolean().optional().describe("Tisknout součet; výchozí ne"),
      }),
    },
    async (input, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const supabase = session.supabase;

      const { data: project } = await supabase
        .from("projects")
        .select("id, name, primary_contact_id")
        .eq("id", input.project_id)
        .maybeSingle();
      if (!project) return fail("Zakázka nenalezena (nebo k ní nemáš přístup).");
      const contactId = input.contact_id ?? (project.primary_contact_id as string | null);
      if (!contactId) return fail("Zakázka nemá klienta — uveď contact_id.");

      const profile = await resolveProfileId(supabase, input.supplier_profile);
      if ("error" in profile) return fail(profile.error!);

      // Fáze a profil ověřit předem, ať nevznikne nabídka a pak chyba „šablonu neznám“.
      let phases: NewQuotePhase[];
      try {
        phases = await buildPhases(supabase, input.phases);
      } catch (err) {
        return fail(errorText(err));
      }

      const supplier = profile.id ? await resolveSupplierProfile(supabase, "quote", profile.id) : null;
      // Kontakt ověřit vždy (RLS): cizí klíč by jinak pustil uhodnuté id kontaktu jiné firmy.
      const { data: contact } = await supabase
        .from("contacts")
        .select("first_name, last_name, address_street, address_house_number, address_city, address_zip")
        .eq("id", contactId)
        .maybeSingle();
      if (!contact) return fail("Objednatel (kontakt) nenalezen (nebo k němu nemáš přístup).");
      let zadavatel = input.zadavatel_text;
      if (zadavatel === undefined) {
        zadavatel = formatClientLine(formatContactName(contact), {
          street: contact.address_street,
          houseNumber: contact.address_house_number,
          city: contact.address_city,
          zip: contact.address_zip,
        });
      }

      const values: Record<string, unknown> = {
        organization_id: session.organizationId,
        project_id: project.id,
        contact_id: contactId,
        name: input.name ?? `Cenová nabídka – ${project.name}`,
        nazev_stavby: input.nazev_stavby,
        zadavatel_text: zadavatel,
        supplier_profile_id: profile.id,
        valid_until: input.valid_until ?? addMonths(supplier?.platnost_nabidky_mesice ?? 3),
        poznamky: input.poznamky ? input.poznamky.join("\n") : (supplier?.vychozi_poznamky ?? null),
        zobrazit_soucet: input.zobrazit_soucet ?? false,
      };
      if (input.number) values.number = input.number;

      const created = await returnPluginError(() => createRecord<{ id: string }>(supabase, "quotes", values)).catch(
        (err: unknown) => ({ error: `Založení nabídky selhalo: ${errorText(err)}` }),
      );
      if ("error" in created) return fail(String(created.error));

      try {
        await appendQuotePhases(supabase, created.id, phases);
        return ok({ vytvoreno: await quoteDetail(supabase, created.id) });
      } catch (err) {
        return fail(`Nabídka se založila (id ${created.id}), ale fáze se neuložily: ${errorText(err)}. Doplň je přes update_quote.`);
      }
    },
  );

  server.registerTool(
    "update_quote",
    {
      title: "Upravit cenovou nabídku",
      description:
        "Upraví cenovou nabídku: název stavby, zadavatele, dodavatele, platnost, poznámky, součet. Když pošleš phases, NAHRADÍ všechny fáze nabídky tímto seznamem (pošli tedy i ty, které mají zůstat — aktuální vrací get_quote_detail). Vrací nabídku po změně.",
      inputSchema: z.strictObject({
        quote_id: z.string().uuid(),
        nazev_stavby: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        zadavatel_text: z.string().optional(),
        supplier_profile: z.string().optional().describe("Profil dodavatele (název, jméno nebo id)"),
        valid_until: z.string().regex(DATE_PATTERN).optional(),
        poznamky: z.array(z.string()).optional().describe("Nahradí všechny poznámky"),
        zobrazit_soucet: z.boolean().optional(),
        phases: z.array(QUOTE_PHASE_INPUT).optional().describe("Nahradí všechny fáze"),
      }),
    },
    async ({ quote_id, supplier_profile, poznamky, phases, ...fields }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const supabase = session.supabase;

      const before = await quoteDetail(supabase, quote_id).catch(() => null);
      if (!before) return fail("Nabídka nenalezena (nebo k ní nemáš přístup).");

      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (poznamky) patch.poznamky = poznamky.join("\n");
      if (supplier_profile !== undefined) {
        const profile = await resolveProfileId(supabase, supplier_profile);
        if ("error" in profile) return fail(profile.error!);
        patch.supplier_profile_id = profile.id;
      }

      let newPhases: NewQuotePhase[] | null = null;
      if (phases) {
        try {
          newPhases = await buildPhases(supabase, phases);
        } catch (err) {
          return fail(errorText(err));
        }
      }
      if (Object.keys(patch).length === 0 && !newPhases) return fail("Nebylo co změnit.");

      if (Object.keys(patch).length > 0) {
        const saved = await returnPluginError(() => updateRecord(supabase, "quotes", quote_id, patch)).catch(
          (err: unknown) => ({ error: `Úprava selhala: ${errorText(err)}` }),
        );
        if ("error" in saved) return fail(String(saved.error));
        const { data: stored } = await supabase.from("quotes").select(Object.keys(patch).join(", ")).eq("id", quote_id).maybeSingle();
        const problems = unsavedFields(patch, stored as Record<string, unknown> | null);
        if (problems.length > 0) return fail(`Nabídka se upravila, ale tato pole se neuložila: ${JSON.stringify(problems)}.`);
      }
      if (newPhases) {
        try {
          await replaceQuotePhases(supabase, quote_id, newPhases);
        } catch (err) {
          return fail(
            `${Object.keys(patch).length > 0 ? "Pole nabídky se upravila, ale f" : "F"}áze se nepodařilo uložit (původní fáze zůstaly, pokud chyba neříká jinak): ${errorText(err)}.`,
          );
        }
      }
      return ok({ pred_zmenou: before, po_zmene: await quoteDetail(supabase, quote_id) });
    },
  );
}
