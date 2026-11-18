import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DELETABLE_SUB_RECORDS, deletionConfirmUrl, describeDeletion } from "@/lib/deleteConfirmation";
import { fail, ok, sessionFrom } from "./shared";

/**
 * Mazání přes AI: AI smí smazání jen PŘIPRAVIT. Vrátí přehled a odkaz, smaže až člověk
 * kliknutím ve webu. Server nepozná, jestli se AI zeptala uživatele — proto samotné
 * smazání přes MCP schválně neexistuje (ani s potvrzovacím kódem, ten by AI poslala sama).
 */
export function registerDeleteTools(server: McpServer) {
  server.registerTool(
    "request_delete",
    {
      title: "Připravit smazání záznamu",
      description:
        `Připraví smazání záznamu (zájemce, kontakt, firma, projekt, nabídka, faktura, aktivita, šablona, vlastní entita) nebo dílčího záznamu (${DELETABLE_SUB_RECORDS.join(", ")}). NIC NESMAŽE: vrátí, co by zmizelo (včetně navázaných záznamů), a odkaz, na kterém to uživatel sám potvrdí v CRM. Odkaz i přehled uživateli ukaž. Používej jen na výslovnou žádost uživatele.`,
      inputSchema: z.object({
        entity: z.string().describe('Logický název entity: "Lead", "Contact", "Account", "Project", "Quote", "Invoice", "Activity", "ProjectTemplate", "Bug" nebo vlastní "new_…"'),
        id: z.string().uuid().describe("ID záznamu"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ entity, id }, ctx) => {
      const session = sessionFrom(ctx);
      if (!session) return fail("Chybí autorizace.");
      const preview = await describeDeletion(session.supabase, session.userId, entity, id);
      if (!preview.ok) return fail(preview.error);
      const origin = (ctx.http?.authInfo as AuthInfo | undefined)?.extra?.origin as string | undefined;
      return ok({
        smaze_se: preview.value.label,
        spolu_s: preview.value.cascades,
        ...(preview.value.touchesInvoices ? { varovani: "Smaže se i vystavená faktura (účetní doklad)." } : {}),
        potvrzeni: deletionConfirmUrl(origin ?? "", preview.value),
        dalsi_krok: "Ještě nic není smazané. Pošli uživateli odkaz — smaže to on kliknutím v CRM.",
      });
    },
  );
}
