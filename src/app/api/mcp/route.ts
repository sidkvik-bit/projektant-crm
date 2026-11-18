import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { resolveMcpSession } from "@/lib/mcp/auth";
import { registerReadTools } from "@/lib/mcp/readTools";
import { registerWriteTools } from "@/lib/mcp/writeTools";
import { registerCustomizationTools } from "@/lib/mcp/customizationTools";
import { registerQuoteTools } from "@/lib/mcp/quoteTools";
import { registerDeleteTools } from "@/lib/mcp/deleteTools";
import { registerEntityTools } from "@/lib/mcp/entityTools";
import { registerOperationTools } from "@/lib/mcp/operationTools";
import { publicOrigin } from "@/lib/mcp/oauthOrigin";
import { withDefaultAnnotations } from "@/lib/mcp/annotations";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions";

/**
 * Vzdálený MCP server nad CRM — uživatel si ho připojí do svého AI klienta (Claude, Cursor…)
 * osobním tokenem z Nastavení → MCP - AI. Inference běží u něj, my poskytujeme jen data.
 *
 * BEZPEČNOSTNÍ ZÁKLAD: každý nástroj sahá na data přes `session.supabase`, což je klient nesoucí
 * access token toho konkrétního uživatele. Izolaci organizací tedy vynucuje Postgres (RLS), ne
 * správnost nástrojů — model si o cizí data může říct jakkoliv a nedostane je. V nástrojích
 * NIKDY nepoužívej createAdminClient(); tím by ta ochrana tiše zmizela.
 *
 * Nástroje jsou schválně ve skupinách (readTools / writeTools / entityTools / operationTools / customizationTools / deleteTools) — čtecí se
 * dají přidávat bez sahání na zápisovou plochu, kde platí přísnější pravidla (viz komentář ve
 * writeTools.ts). Mazat a vystavovat faktury smí jen člověk ve webu — nástroje k tomu jen připraví odkaz
 * (deleteTools, request_invoice_from_quote). Citlivé věci (role, pozvánky, IBAN, tokeny, Google)
 * tu schválně nejsou: text v datech CRM (třeba přijatý e-mail) by k nim mohl AI navést.
 */
const handler = createMcpHandler(
  (mcpServer) => {
    const server = withDefaultAnnotations(mcpServer);
    registerReadTools(server);
    registerWriteTools(server);
    registerQuoteTools(server);
    registerCustomizationTools(server);
    registerEntityTools(server);
    registerOperationTools(server);
    registerDeleteTools(server);
  },
  { serverInfo: { name: "projektantcrm", version: "1.3.0" }, instructions: MCP_INSTRUCTIONS },
);

const verifyToken = async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const session = await resolveMcpSession(bearerToken);
  if (!session) return undefined;
  return {
    token: bearerToken,
    scopes: ["crm"],
    clientId: session.userId,
    // origin: odkazy, které nástroje vrací (potvrzení smazání), musí mířit na veřejnou adresu.
    extra: { session, origin: publicOrigin(req) },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
