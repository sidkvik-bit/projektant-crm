"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRedirectUriAllowed, resolveOAuthClient } from "@/lib/mcp/oauthClients";
import { issueAuthorizationCode } from "@/lib/mcp/oauthTokens";
import { createDedicatedRefreshToken } from "@/lib/mcp/oauthSession";

/**
 * Zpracuje kliknutí na Povolit/Zamítnout.
 *
 * Klient i návratová adresa se ověřují ZNOVU, i když je stránka už jednou ověřila — na hodnoty
 * ze skrytých polí formuláře se spolehnout nedá, ty přijdou od prohlížeče a jdou podvrhnout.
 *
 * Při souhlasu se konektoru založí vlastní Supabase relace a do kódu se uloží její refresh
 * token; z něj si pak MCP server vymění access token, takže dotazy běží pod identitou tohohle
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

  // getUser ověří přihlášení u Supabase (getSession jen čte cookie).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Chybí přihlášení — zkus se přihlásit znovu.");

  // Konektor dostane vlastní relaci, ne tu z prohlížeče — viz createDedicatedRefreshToken.
  const code = await issueAuthorizationCode({
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
    supabaseRefreshToken: await createDedicatedRefreshToken(user.id),
  });

  target.searchParams.set("code", code);
  redirect(target.toString());
}
