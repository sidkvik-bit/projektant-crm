import { createElement } from "react";
import { formatContactName } from "@/engine/contacts";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotePdfDocument, type QuotePdfData, type QuotePdfPhase, type QuotePdfSupplier } from "@/lib/quotePdf";
import { formatClientLine, formatAddressLine, parseLines, quoteFileName } from "@/lib/quoteDocument";
import { resolveSupplierProfile, supplierAddress } from "@/lib/supplierProfiles";

interface AddressRow {
  address_street: string | null;
  address_house_number: string | null;
  address_city: string | null;
  address_zip: string | null;
}

interface QuoteRow {
  number: string;
  name: string;
  created_at: string;
  vat_rate: number;
  odberatel_je_firma: boolean;
  je_platce_dph: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
  note: string | null;
  supplier_profile_id: string | null;
  nazev_stavby: string | null;
  zadavatel_text: string | null;
  poznamky: string | null;
  zobrazit_soucet: boolean;
  project: { name: string } | null;
  contact: (AddressRow & {
    first_name: string;
    last_name: string | null;
    account: (AddressRow & { name: string }) | null;
  }) | null;
}

const ADDRESS = "address_street, address_house_number, address_city, address_zip";

const addressOf = (row: AddressRow) => ({
  street: row.address_street,
  houseNumber: row.address_house_number,
  city: row.address_city,
  zip: row.address_zip,
});

/**
 * PDF nabídky na vyžádání (nic se neukládá) — jen přihlášenému uživateli téže organizace
 * (RLS na quotes/quote_phases/quote_items/supplier_profiles/organizations).
 *
 * `?inline=1` vrací PDF k zobrazení (náhled v detailu nabídky), jinak ke stažení.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const [
    { data: quote, error: quoteError },
    { data: phases, error: phasesError },
    { data: items, error: itemsError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "number, name, created_at, vat_rate, subtotal, vat_amount, total, note, odberatel_je_firma, je_platce_dph, " +
          "supplier_profile_id, nazev_stavby, zadavatel_text, poznamky, zobrazit_soucet, " +
          "project:projects!quotes_project_id_fkey(name), " +
          `contact:contacts!quotes_contact_id_fkey(first_name, last_name, ${ADDRESS}, ` +
          `account:accounts!contacts_account_id_fkey(name, ${ADDRESS}))`,
      )
      .eq("id", id)
      .single(),
    supabase.from("quote_phases").select("kod, nazev, odrazky, cena").eq("quote_id", id).order("sort_order"),
    supabase.from("quote_items").select("name, line_total").eq("quote_id", id).order("sort_order"),
    supabase
      .from("users")
      .select(`organizations(name, supplier_name, logo_url, ico, dic, je_platce_dph, ${ADDRESS})`)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (quoteError?.code === "PGRST116") return NextResponse.json({ error: "Nabídka nenalezena." }, { status: 404 });
  if (quoteError || !quote || phasesError || itemsError || profileError) {
    console.error("quote pdf: load failed", { id, quoteError, phasesError, itemsError, profileError });
    return NextResponse.json({ error: "PDF nabídky se nepodařilo připravit." }, { status: 500 });
  }

  const q = quote as unknown as QuoteRow;
  const org = profile?.organizations as unknown as (AddressRow & {
    name: string;
    supplier_name: string | null;
    logo_url: string | null;
    ico: string | null;
    dic: string | null;
    je_platce_dph: boolean;
  }) | null;

  let supplierProfile;
  try {
    supplierProfile = await resolveSupplierProfile(supabase, "quote", q.supplier_profile_id);
  } catch (error) {
    console.error("quote pdf: supplier profile load failed", { id, error });
    return NextResponse.json({ error: "PDF nabídky se nepodařilo připravit." }, { status: 500 });
  }

  // Bez profilu dodavatele se tiskne, co je v Nastavení → Fakturace (stav před profily).
  const supplier: QuotePdfSupplier = supplierProfile
    ? {
        jmeno: supplierProfile.jmeno,
        adresa: supplierAddress(supplierProfile),
        ico: supplierProfile.ico,
        dic: supplierProfile.dic,
        jePlatceDph: q.je_platce_dph,
        email: supplierProfile.email,
        telefon: supplierProfile.telefon,
        web: supplierProfile.web,
        mistoVystaveni: supplierProfile.misto_vystaveni,
        logoUrl: supplierProfile.logo_url,
      }
    : {
        jmeno: org?.supplier_name || org?.name || "",
        adresa: org ? formatAddressLine(addressOf(org)) : "",
        ico: org?.ico ?? null,
        dic: org?.dic ?? null,
        jePlatceDph: q.je_platce_dph,
        email: null,
        telefon: null,
        web: null,
        mistoVystaveni: null,
        logoUrl: org?.logo_url ?? null,
      };

  // Zadavatel: ručně upravený text z nabídky, jinak firma (když se na ni vystavuje) nebo kontakt.
  const billToAccount = q.odberatel_je_firma ? (q.contact?.account ?? null) : null;
  const zadavatel =
    q.zadavatel_text?.trim() ||
    (billToAccount
      ? formatClientLine(billToAccount.name, addressOf(billToAccount))
      : q.contact
        ? formatClientLine(formatContactName(q.contact), addressOf(q.contact))
        : "");

  // Starší nabídky mají položky místo fází — vytisknou se jako fáze bez odrážek.
  const phaseRows = (phases ?? []) as { kod: string | null; nazev: string; odrazky: string[]; cena: number }[];
  const pdfPhases: QuotePdfPhase[] = [
    ...phaseRows.map((p) => ({ nazev: p.nazev, odrazky: p.odrazky ?? [], cena: Number(p.cena) })),
    ...((items ?? []) as { name: string; line_total: number }[]).map((i) => ({
      nazev: i.name,
      odrazky: [],
      cena: Number(i.line_total),
    })),
  ];

  const data: QuotePdfData = {
    number: q.number,
    nazevStavby: q.nazev_stavby?.trim() || q.project?.name || q.name,
    supplier,
    zadavatel,
    phases: pdfPhases,
    showTotal: q.zobrazit_soucet,
    vatRegistered: q.je_platce_dph,
    vatRate: Number(q.vat_rate),
    subtotal: Number(q.subtotal),
    vatAmount: Number(q.vat_amount),
    total: Number(q.total),
    notes: parseLines(q.poznamky ?? q.note),
    issuedAt: q.created_at,
  };

  const buffer = await renderToBuffer(
    createElement(QuotePdfDocument, { data }) as Parameters<typeof renderToBuffer>[0],
  );

  const fileName = `${quoteFileName(phaseRows.map((p) => p.kod), zadavatel, q.number)}.pdf`;
  const asciiName = fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
