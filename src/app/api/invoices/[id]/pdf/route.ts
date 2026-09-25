import { createElement } from "react";
import { formatContactName } from "@/engine/contacts";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { InvoicePdfDocument, type InvoicePdfData } from "@/lib/invoicePdf";
import { buildAddressQuery } from "@/lib/mapbox";
import { accountToIban } from "@/lib/czechBank";
import { buildSpayd, generateQrPaymentDataUrl } from "@/lib/qrPayment";

interface InvoiceRow {
  number: string;
  name: string;
  variabilni_symbol: string | null;
  datum_vystaveni: string;
  datum_splatnosti: string | null;
  datum_zdanitelneho_plneni: string | null;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  note: string | null;
  contact: {
    first_name: string;
    last_name: string | null;
    email: string | null;
    address_street: string | null;
    address_house_number: string | null;
    address_city: string | null;
    address_zip: string | null;
    address_country: string | null;
    account: {
      name: string;
      address_street: string | null;
      address_house_number: string | null;
      address_city: string | null;
      address_zip: string | null;
      address_country: string | null;
    } | null;
  } | null;
  forma_uhrady: { label: string } | null;
}

interface InvoiceItemRow {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

interface OrganizationRow {
  name: string;
  logo_url: string | null;
  ico: string | null;
  dic: string | null;
  address_street: string | null;
  address_house_number: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_country: string | null;
  bank_account: string | null;
}

/** Generuje PDF faktury na vyžádání, s QR Platbou (viz src/lib/qrPayment.ts) když má organizace
 * nastavený bankovní účet — jinak PDF vynechá jen QR obrázek, ne celou fakturu. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášený uživatel." }, { status: 401 });

  const [{ data: invoice, error: invoiceError }, { data: items }, { data: profile }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "number, name, variabilni_symbol, datum_vystaveni, datum_splatnosti, datum_zdanitelneho_plneni, " +
          "vat_rate, subtotal, vat_amount, total, note, " +
          "contact:contacts!invoices_contact_id_fkey(first_name, last_name, email, " +
          "address_street, address_house_number, address_city, address_zip, address_country, " +
          "account:accounts!contacts_account_id_fkey(name, address_street, address_house_number, address_city, address_zip, address_country)), " +
          "forma_uhrady:option_set_values!invoices_forma_uhrady_id_fkey(label)",
      )
      .eq("id", id)
      .single(),
    supabase.from("invoice_items").select("name, quantity, unit, unit_price, line_total").eq("invoice_id", id).order("sort_order"),
    supabase
      .from("users")
      .select(
        "organizations(name, logo_url, ico, dic, address_street, address_house_number, address_city, address_zip, address_country, bank_account)",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (invoiceError || !invoice) return NextResponse.json({ error: "Faktura nenalezena." }, { status: 404 });

  const inv = invoice as unknown as InvoiceRow;
  const org = (profile?.organizations as unknown as OrganizationRow | null) ?? {
    name: "ProjektantCRM",
    logo_url: null,
    ico: null,
    dic: null,
    address_street: null,
    address_house_number: null,
    address_city: null,
    address_zip: null,
    address_country: null,
    bank_account: null,
  };

  const iban = org.bank_account ? accountToIban(org.bank_account) : null;
  let qrDataUrl: string | null = null;
  if (iban) {
    const spayd = buildSpayd({
      iban,
      amount: Number(inv.total),
      variableSymbol: inv.variabilni_symbol,
      dueDate: inv.datum_splatnosti,
      message: inv.name,
    });
    qrDataUrl = await generateQrPaymentDataUrl(spayd);
  }

  const customerName = inv.contact ? formatContactName(inv.contact) : "—";

  const data: InvoicePdfData = {
    number: inv.number,
    name: inv.name,
    variabilniSymbol: inv.variabilni_symbol,
    datumVystaveni: inv.datum_vystaveni,
    datumSplatnosti: inv.datum_splatnosti,
    datumZdanitelnehoPlneni: inv.datum_zdanitelneho_plneni,
    formaUhrady: inv.forma_uhrady?.label ?? null,
    supplier: { name: org.name, ico: org.ico, dic: org.dic, address: buildAddressQuery(org), logoUrl: org.logo_url },
    // Odběratelem je firma kontaktu — právnicky správně. U soukromé osoby (pro projektanta
    // nejběžnější klient) je odběratelem ona sama, proto má kontakt vlastní adresu; bez ní by
    // daňový doklad vyšel bez adresy odběratele. Jméno se pak netiskne dvakrát.
    customer: {
      name: inv.contact?.account?.name ?? customerName,
      address: inv.contact?.account
        ? buildAddressQuery(inv.contact.account)
        : inv.contact
          ? buildAddressQuery(inv.contact)
          : null,
      contactName: inv.contact?.account ? customerName : null,
      contactEmail: inv.contact?.email ?? null,
    },
    vatRate: Number(inv.vat_rate),
    subtotal: Number(inv.subtotal),
    vatAmount: Number(inv.vat_amount),
    total: Number(inv.total),
    note: inv.note,
    items: ((items ?? []) as unknown as InvoiceItemRow[]).map((item) => ({
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    bankAccount: org.bank_account,
    iban,
    qrDataUrl,
  };

  const buffer = await renderToBuffer(
    createElement(InvoicePdfDocument, { data }) as Parameters<typeof renderToBuffer>[0],
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${inv.number}.pdf"`,
    },
  });
}
