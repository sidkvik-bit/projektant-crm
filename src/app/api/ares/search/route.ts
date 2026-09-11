import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupAresByIco, searchAresByName } from "@/lib/ares";

/** Proxy na ARES (žádný klíč, ale gated za přihlášením — ať naším serverem nejde volně
 * proxovat cizí veřejné API). `mode=ico` čeká přesně 8 číslic, `mode=name` hledá od 3 znaků. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const mode = searchParams.get("mode") === "ico" ? "ico" : "name";

  try {
    if (mode === "ico") {
      if (!/^\d{8}$/.test(q)) return NextResponse.json({ matches: [] });
      const match = await lookupAresByIco(q);
      return NextResponse.json({ matches: match ? [match] : [] });
    }

    if (q.length < 3) return NextResponse.json({ matches: [] });
    const matches = await searchAresByName(q);
    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ matches: [], error: "ARES je momentálně nedostupné." }, { status: 502 });
  }
}
