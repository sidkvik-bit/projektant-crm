import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveRuian, suggestRuian } from "@/lib/ruian";

/** Proxy na geokódovací službu ČÚZK nad RÚIAN (žádný klíč, ale gated za přihlášením — ať
 * naším serverem nejde volně proxovat cizí veřejné API; stejně jako /api/ares/search).
 *
 * Bez `key` našeptává (`q` od 3 znaků), s `key` (magicKey z našeptávání) dotáhne vybranou
 * položku včetně souřadnic. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const key = searchParams.get("key");

  try {
    if (key) {
      const address = await resolveRuian(q, key);
      return NextResponse.json({ address });
    }

    if (q.length < 3) return NextResponse.json({ suggestions: [] });
    return NextResponse.json({ suggestions: await suggestRuian(q) });
  } catch {
    return NextResponse.json(
      { suggestions: [], address: null, error: "Registr adres ČÚZK je momentálně nedostupný." },
      { status: 502 },
    );
  }
}
