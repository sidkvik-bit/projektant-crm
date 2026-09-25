"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRedirectUriAllowed, resolveOAuthClient } from "@/lib/mcp/oauthClients";
import { issueAuthorizationCode } from "@/lib/mcp/oauthTokens";

/**
 * Zpracuje kliknutí na Povolit/Zamítnout.
 *
 * Klient i návratová adresa se ověřují ZNOVU, i když je stránka už jednou ověřila — na hodnoty
 * ze skrytých polí formuláře se spolehnout nedá, ty přijdou od prohlížeče a jdou podvrhnout.
 *
 * Při souhlasu se do kódu uloží Supabase refresh token přihlášené relace; z něj si pak MCP
 * server u každého volání vymění čerstvý access token, takže dotazy běží pod identitou tohohle
 * uživatele a platí na ně RLS úplně stejně jako ve webu.
 */
export async function approveAuthorization(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const codeChallenge = String(formData.get("code_challenge") ?? "");
  const state = formData.get("state");
  const decision = String(formData.get("decision") ?? "deny");

  const client = await resolveOAuthClient(clientId);
  if (!client || !isRedirectUriAllowed(client, redirectUri)) {
    throw new Error("Neplatný klient nebo návratová adresa.");
  }

  const target = new URL(redirectUri);
  if (typeof state === "string" && state) target.searchParams.set("state", state);

  if (decision !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.refresh_token) throw new Error("Chybí přihlášení — zkus se přihlásit znovu.");

  const code = await issueAuthorizationCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    codeChallenge,
    supabaseRefreshToken: session.refresh_token,
  });

  target.searchParams.set("code", code);
  redirect(target.toString());
}
