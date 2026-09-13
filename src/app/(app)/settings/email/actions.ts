"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EmailSyncStatus {
  connected: boolean;
  mailboxEmail: string | null;
  lastSyncedAt: string | null;
}

async function getMyOrganizationId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("organization_id").eq("user_id", user.id).single();
  return data?.organization_id ?? null;
}

/** Refresh_token se sem nikdy nedostane (viz email_sync_connections — bez klientské RLS
 * policy), server action vrací admin klientovi jen bezpečnou podmnožinu pro UI. */
export async function getEmailSyncStatus(): Promise<EmailSyncStatus> {
  const organizationId = await getMyOrganizationId();
  if (!organizationId) return { connected: false, mailboxEmail: null, lastSyncedAt: null };

  const admin = createAdminClient();
  const { data } = await admin
    .from("email_sync_connections")
    .select("mailbox_email, last_synced_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return { connected: false, mailboxEmail: null, lastSyncedAt: null };
  return { connected: true, mailboxEmail: data.mailbox_email, lastSyncedAt: data.last_synced_at };
}

export async function disconnectEmailSync() {
  const organizationId = await getMyOrganizationId();
  if (!organizationId) throw new Error("Nepřihlášený uživatel.");

  const admin = createAdminClient();
  const { error } = await admin.from("email_sync_connections").delete().eq("organization_id", organizationId);
  if (error) throw error;
  revalidatePath("/settings/email");
}
