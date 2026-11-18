import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { resolveMcpSession } from "@/lib/mcp/auth";
import { registerReadTools } from "@/lib/mcp/readTools";
import { registerWriteTools } from "@/lib/mcp/writeTools";
import { registerCustomizationTools } from "@/lib/mcp/customizationTools";
import { registerQuoteTools } from "@/lib/mcp/quoteTools";

/**
 * Vzdálený MCP server nad CRM — uživatel si ho připojí do svého AI klienta (Claude, Cursor…)
 * osobním tokenem z Nastavení → MCP - AI. Inference běží u něj, my poskytujeme jen data.
 *
 * BEZPEČNOSTNÍ ZÁKLAD: každý nástroj sahá na data přes `session.supabase`, což je klient nesoucí
 * access token toho konkrétního uživatele. Izolaci organizací tedy vynucuje Postgres (RLS), ne
 * správnost nástrojů — model si o cizí data může říct jakkoliv a nedostane je. V nástrojích
 * NIKDY nepoužívej createAdminClient(); tím by ta ochrana tiše zmizela.
 *
 * Nástroje jsou schválně ve skupinách (readTools / writeTools / customizationTools) — čtecí se
 * dají přidávat bez sahání na zápisovou plochu, kde platí přísnější pravidla (viz komentář ve
 * writeTools.ts). Úpravy firmy jde přes AI jen připravit jako draft, publikuje člověk.
 */
const handler = createMcpHandler(
  (server) => {
    registerReadTools(server);
    registerWriteTools(server);
    registerQuoteTools(server);
    registerCustomizationTools(server);
  },
  { serverInfo: { name: "projektantcrm", version: "1.3.0" } },
);

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const session = await resolveMcpSession(bearerToken);
  if (!session) return undefined;
  return {
    token: bearerToken,
    scopes: ["crm"],
    clientId: session.userId,
    extra: { session },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
