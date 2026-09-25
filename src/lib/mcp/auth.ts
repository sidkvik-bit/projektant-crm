import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_PREFIX = "pcrm_";

export function generateMcpToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashMcpToken(token) };
}

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface McpSession {
  userId: string;
  organizationId: string;
  /** Klient pod identitou uživatele — RLS na něj platí stejně jako ve webové appce. */
  supabase: SupabaseClient;
}

/**
 * Vymění osobní MCP token za klienta jednajícího ZA TOHO UŽIVATELE.
 *
 * Service_role se tu používá výhradně na jednu věc: dohledat, komu token patří (to nejde
 * udělat jinak — před ověřením ještě nevíme, kdo volá). Samotná data se přes něj NIKDY
 * nečtou; vrácený `supabase` klient nese access token uživatele, takže veškerá izolace
 * organizací zůstává na Postgresu, ne na správnosti tohohle kódu.
 *
 * Refresh tokeny se při použití rotují, takže se nový hned ukládá zpátky. Když uživatel
 * mezitím odhlásí všechna zařízení, refresh selže a token přestane fungovat — to je záměr.
 */
export async function resolveMcpSession(token: string): Promise<McpSession | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mcp_tokens")
    .select("id, user_id, refresh_token, revoked_at")
    .eq("token_hash", hashMcpToken(token))
    .maybeSingle();

  if (!row || row.revoked_at) return null;

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: refreshed, error } = await anon.auth.refreshSession({
    refresh_token: row.refresh_token as string,
  });
  if (error || !refreshed.session) return null;

  await admin
    .from("mcp_tokens")
    .update({ refresh_token: refreshed.session.refresh_token, last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${refreshed.session.access_token}` } },
    },
  );

  // Organizaci čteme už tímhle (uživatelským) klientem — kdyby se identita nepropsala,
  // nevrátí se nic a request skončí, místo aby se tiše pokračovalo bez kontextu.
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("user_id", row.user_id as string)
    .maybeSingle();
  if (!profile) return null;

  return { userId: row.user_id as string, organizationId: profile.organization_id, supabase };
}
