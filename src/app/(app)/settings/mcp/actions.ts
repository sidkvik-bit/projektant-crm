"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMcpToken } from "@/lib/mcp/auth";

export interface McpTokenRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listMcpTokens(): Promise<McpTokenRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("mcp_tokens")
    .select("id, name, created_at, last_used_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return ((data ?? []) as { id: string; name: string; created_at: string; last_used_at: string | null }[]).map(
    (row) => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }),
  );
}

/**
 * Vrací plain token — zobrazí se uživateli JEDNOU a nikde se neukládá (v databázi je jen hash).
 * Spolu s ním se ukládá refresh token aktuální relace; z něj si MCP server při každém volání
 * vymění krátkodobý access token, takže dotazy běží pod identitou uživatele (viz lib/mcp/auth.ts).
 */
export async function createMcpToken(name: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.refresh_token) throw new Error("Chybí přihlášení — zkus se odhlásit a přihlásit znovu.");

  const { token, hash } = generateMcpToken();
  const admin = createAdminClient();
  const { error } = await admin.from("mcp_tokens").insert({
    user_id: session.user.id,
    name: name.trim() || "MCP token",
    token_hash: hash,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;

  revalidatePath("/settings/mcp");
  return token;
}

export async function revokeMcpToken(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");

  const admin = createAdminClient();
  // Filtr na user_id je tu podstatný — admin klient RLS obchází, takže bez něj by šlo
  // odvolat cizí token jen hádáním id.
  const { error } = await admin
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/settings/mcp");
}
