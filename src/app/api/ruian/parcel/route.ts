import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchParcels } from "@/lib/ruianParcels";

/** Proxy na mapovou službu ČÚZK nad RÚIAN (žádný klíč, ale gated za přihlášením — stejně jako
 * /api/ares/search a /api/ruian/address). Hledá parcely podle začátku čísla v katastrálním
 * území; bez obojího nic nevrací. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const katastralniUzemi = (searchParams.get("ku") ?? "").trim();
  const cisloParcely = (searchParams.get("q") ?? "").trim();
  if (!katastralniUzemi || !cisloParcely) return NextResponse.json({ parcels: [] });

  try {
    return NextResponse.json({ parcels: await searchParcels(katastralniUzemi, cisloParcely) });
  } catch {
    return NextResponse.json(
      { parcels: [], error: "Katastr nemovitostí je momentálně nedostupný." },
      { status: 502 },
    );
  }
}
