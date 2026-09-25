import { randomBytes } from "node:crypto";
import { registerOAuthClient } from "@/lib/mcp/oauthClients";

/**
 * Dynamická registrace klienta (RFC 7591) — záložní cesta pro klienty, co neumí CIMD.
 *
 * Registrace je otevřená (tak to protokol myslí): samotná registrace nedává přístup k ničemu,
 * jen si klient řekne o identitu. Data uživatele se vydají teprve tehdy, když konkrétní člověk
 * na /oauth/authorize klikne na "Povolit". Proto se tu nevrací client_secret — klient je veřejný
 * a prokazuje se PKCE.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris je povinné." },
      { status: 400 },
    );
  }

  const clientId = `pcrmc_${randomBytes(16).toString("hex")}`;
  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  await registerOAuthClient({ clientId, clientName, redirectUris });

  return Response.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
