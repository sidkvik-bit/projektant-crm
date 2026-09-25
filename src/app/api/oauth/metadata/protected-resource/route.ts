import { publicOrigin } from "@/lib/mcp/oauthOrigin";

/**
 * RFC 9728 metadata chráněného zdroje — z 401 na /api/mcp sem vede odkaz a klient se odsud
 * dozví, který autorizační server má oslovit. U nás je to tentýž původ.
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
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
