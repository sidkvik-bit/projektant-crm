import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // Google vrátí provider_refresh_token jen když login žádal o Drive scope s
  // access_type=offline&prompt=consent (viz login/page.tsx) — chybí např. u starších
  // relací nebo pokud uživatel scope odmítl. Uložení je "best effort": bez něj CRM
  // později jen ukáže "Připojit Google Drive" místo obsahu složky, nic nezablokuje.
  if (exchanged.session?.provider_refresh_token) {
    const admin = createAdminClient();
    await admin.from("google_drive_tokens").upsert(
      {
        user_id: user.id,
        refresh_token: exchanged.session.provider_refresh_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const { data: prefs } = await supabase
    .from("users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // "Připojit Google Drive" z detailu záznamu posílá zpátky tam, odkud přišel (viz
  // ConnectDriveButton) — jen relativní cesta, ať to nejde zneužít jako open redirect.
  const next = searchParams.get("next");
  const isSafeNext = next && next.startsWith("/") && !next.startsWith("//");

  return NextResponse.redirect(`${origin}${isSafeNext ? next : prefs ? "/leads" : "/onboarding"}`);
}
