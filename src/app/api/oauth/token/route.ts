import { resolveOAuthClient } from "@/lib/mcp/oauthClients";
import { exchangeAuthorizationCode, refreshAccessToken, type ExchangeResult } from "@/lib/mcp/oauthTokens";

/**
 * Token endpoint. Přijímá `application/x-www-form-urlencoded` (RFC 6749 to tak vyžaduje, JSON
 * klienti neposílají) a umí dva granty: výměnu autorizačního kódu a obnovení přes refresh token.
 *
 * Chybové kódy musí být ty z RFC 6749 — klienti se podle nich rozhodují, jestli zkusit obnovu,
 * nebo uživatele poslat znovu přihlásit. Vlastní hlášky by je zmátly.
 */
export const dynamic = "force-dynamic";

function fail(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status });
}

function respond(result: ExchangeResult) {
  if ("error" in result) return fail(result.error, result.description);
  return Response.json(
    {
      access_token: result.tokens.accessToken,
      token_type: "Bearer",
      expires_in: result.tokens.expiresIn,
      refresh_token: result.tokens.refreshToken,
      scope: "crm",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return fail("invalid_request", "Očekává se application/x-www-form-urlencoded.");

  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };

  const grantType = get("grant_type");
  const clientId = get("client_id");
  if (!clientId) return fail("invalid_client", "Chybí client_id.");

  const client = await resolveOAuthClient(clientId);
  if (!client) return fail("invalid_client", "Neznámý klient.");

  if (grantType === "authorization_code") {
    const code = get("code");
    const redirectUri = get("redirect_uri");
    const codeVerifier = get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) {
      return fail("invalid_request", "Chybí code, redirect_uri nebo code_verifier.");
    }
    return respond(
      await exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
        clientName: client.clientName,
      }),
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = get("refresh_token");
    if (!refreshToken) return fail("invalid_request", "Chybí refresh_token.");
    return respond(await refreshAccessToken({ refreshToken, clientId, clientName: client.clientName }));
  }

  return fail("unsupported_grant_type", "Podporuje se authorization_code a refresh_token.");
}
