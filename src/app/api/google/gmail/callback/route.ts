import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeGmailCode, fetchGoogleAccountEmail } from "@/lib/gmailOAuth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const settingsUrl = (status: "connected" | "error", message?: string) =>
    NextResponse.redirect(
      `${origin}/settings/email?status=${status}${message ? `&message=${encodeURIComponent(message)}` : ""}`,
    );

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("gmail_oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return settingsUrl("error", "Ověření se nezdařilo, zkus to prosím znovu.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: profile } = await supabase.from("users").select("organization_id").eq("user_id", user.id).single();
  if (!profile) return settingsUrl("error", "Chybí uživatelský profil.");

  const redirectUri = `${origin}/api/google/gmail/callback`;
  const tokens = await exchangeGmailCode(code, redirectUri);
  if (!tokens?.refresh_token) {
    return settingsUrl(
      "error",
      "Google nevrátil refresh token — zkus schránku odpojit v účtu na myaccount.google.com/permissions a připojit znovu.",
    );
  }

  const mailboxEmail = await fetchGoogleAccountEmail(tokens.access_token);
  if (!mailboxEmail) return settingsUrl("error", "Nepodařilo se zjistit e-mailovou adresu schránky.");

  const admin = createAdminClient();
  const { error } = await admin.from("email_sync_connections").upsert(
    {
      organization_id: profile.organization_id,
      mailbox_email: mailboxEmail,
      refresh_token: tokens.refresh_token,
      // Nové připojení = nová historie od nuly, ne od stavu předchozí schránky.
      last_history_id: null,
      last_synced_at: null,
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return settingsUrl("error", error.message);

  const response = settingsUrl("connected");
  response.cookies.delete("gmail_oauth_state");
  return response;
}
