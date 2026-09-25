import { publicOrigin } from "@/lib/mcp/oauthOrigin";

/**
 * RFC 8414 metadata autorizačního serveru — podle nich si klient najde /authorize a /token.
 *
 * Dvě pole jsou tu kritická: `code_challenge_methods_supported: ["S256"]` (bez PKCE klient
 * odmítne pokračovat) a dvojice `client_id_metadata_document_supported` + auth metoda "none",
 * kterou Claudovi říkáme, že umíme CIMD a nemusí se nikde registrovat.
 *
 * CORS je tu schválně otevřený: metadata jsou veřejná a čtou je i klienti běžící v prohlížeči.
 */
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      scopes_supported: ["crm", "offline_access"],
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
