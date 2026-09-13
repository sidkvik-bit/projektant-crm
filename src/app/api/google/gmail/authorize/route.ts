import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGmailAuthUrl } from "@/lib/gmailOAuth";

/** Spustí OAuth pro připojení dedikované tracking schránky — nezávisle na Supabase Auth
 * relaci přihlášeného admina (viz gmailOAuth.ts). `state` je náhodný token uložený do
 * httpOnly cookie a ověřený zpátky v /callback (CSRF ochrana standardního OAuth flow). */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/google/gmail/callback`;
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(buildGmailAuthUrl(redirectUri, state));
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google/gmail",
  });
  return response;
}
