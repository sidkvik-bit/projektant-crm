import { NextResponse } from "next/server";
import { syncAllOrganizations } from "@/lib/gmailSync";

// Volá se z pg_cron/pg_net přímo z Supabase (viz jednorázový SQL skript na /settings/email),
// ne z Vercel Cronu — ten na Hobby plánu umí jen 1x/den, sledování e-mailů chce syncovat
// v řádu minut. Autorizace stejným CRON_SECRET vzorem jako /api/cron/daily-digest.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllOrganizations();
  return NextResponse.json({ results });
}
