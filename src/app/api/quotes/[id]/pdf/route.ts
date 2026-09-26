import { createElement } from "react";
import { formatContactName } from "@/engine/contacts";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { QuotePdfDocument, type QuotePdfData } from "@/lib/quotePdf";

interface QuoteRow {
  number: string;
  name: string;
  created_at: string;
  valid_until: string | null;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  note: string | null;
  project: { name: string } | null;
  contact: {
    first_name: string;
    last_name: string | null;
    email: string | null;
    account: { name: string } | null;
  } | null;
}

interface QuoteItemRow {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

/** Generuje PDF nabídky na vyžádání (žádné uložené soubory) — dostupné jen přihlášenému uživateli
 * s přístupem do stejné organizace (RLS na `quotes`/`quote_items`/`organizations`). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const [{ data: quote, error: quoteError }, { data: items }, { data: profile }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "number, name, created_at, valid_until, vat_rate, subtotal, vat_amount, total, note, " +
          "project:projects!quotes_project_id_fkey(name), " +
          "contact:contacts!quotes_contact_id_fkey(first_name, last_name, email, " +
          "account:accounts!contacts_account_id_fkey(name))",
      )
      .eq("id", id)
      .single(),
    supabase.from("quote_items").select("name, quantity, unit, unit_price, line_total").eq("quote_id", id).order("sort_order"),
    supabase.from("users").select("organizations(name, supplier_name, logo_url)").eq("user_id", user.id).maybeSingle(),
  ]);

  if (quoteError || !quote) return NextResponse.json({ error: "Nabídka nenalezena." }, { status: 404 });

  const q = quote as unknown as QuoteRow;
  const org = profile?.organizations as unknown as { name: string; logo_url: string | null } | null;

  const contactName = q.contact ? formatContactName(q.contact) : null;

  const data: QuotePdfData = {
    organizationName: org?.name ?? "ProjektantCRM",
    organizationLogoUrl: org?.logo_url ?? null,
    number: q.number,
    name: q.name,
    createdAt: q.created_at,
    validUntil: q.valid_until,
    projectName: q.project?.name ?? "—",
    // Objednatelem je firma kontaktu; u soukromé osoby ona sama. Jméno se pak netiskne dvakrát.
    accountName: q.contact?.account?.name ?? contactName,
    contactName: q.contact?.account ? contactName : null,
    contactEmail: q.contact?.email ?? null,
    vatRate: Number(q.vat_rate),
    subtotal: Number(q.subtotal),
    vatAmount: Number(q.vat_amount),
    total: Number(q.total),
    note: q.note,
    items: ((items ?? []) as unknown as QuoteItemRow[]).map((item) => ({
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  };

  const buffer = await renderToBuffer(
    createElement(QuotePdfDocument, { data }) as Parameters<typeof renderToBuffer>[0],
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${q.number}.pdf"`,
    },
  });
}
