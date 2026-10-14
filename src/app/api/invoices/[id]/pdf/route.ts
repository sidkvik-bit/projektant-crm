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
  odberatel_je_firma: boolean;
  je_platce_dph: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
  note: string | null;
  contact: {
    first_name: string;
    last_name: string | null;
    email: string | null;
    ico: string | null;
    address_street: string | null;
    address_house_number: string | null;
    address_city: string | null;
    address_zip: string | null;
    address_country: string | null;
    account: {
      name: string;
      ico: string | null;
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
  supplier_name: string | null;
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

  const [
    { data: invoice, error: invoiceError },
    { data: items, error: itemsError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "number, name, variabilni_symbol, datum_vystaveni, datum_splatnosti, datum_zdanitelneho_plneni, " +
          "vat_rate, subtotal, vat_amount, total, note, odberatel_je_firma, je_platce_dph, " +
          "contact:contacts!invoices_contact_id_fkey(first_name, last_name, email, " +
          "ico, address_street, address_house_number, address_city, address_zip, address_country, " +
          "account:accounts!contacts_account_id_fkey(name, ico, address_street, address_house_number, address_city, address_zip, address_country)), " +
          "forma_uhrady:option_set_values!invoices_forma_uhrady_id_fkey(label)",
      )
      .eq("id", id)
      .single(),
    supabase.from("invoice_items").select("name, quantity, unit, unit_price, line_total").eq("invoice_id", id).order("sort_order"),
    supabase
      .from("users")
      .select(
        "organizations(name, supplier_name, logo_url, ico, dic, address_street, address_house_number, address_city, address_zip, address_country, bank_account)",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (invoiceError?.code === "PGRST116") return NextResponse.json({ error: "Faktura nenalezena." }, { status: 404 });

  // Faktura bez položek nebo bez údajů dodavatele je pořád platně vypadající daňový doklad —
  // radši žádné PDF než špatné, které odejde klientovi.
  const org = profile?.organizations as unknown as OrganizationRow | null;
  if (invoiceError || !invoice || itemsError || profileError || !org) {
    console.error("invoice pdf: load failed", { id, invoiceError, itemsError, profileError, hasOrg: Boolean(org) });
    return NextResponse.json({ error: "PDF faktury se nepodařilo připravit." }, { status: 500 });
  }

  const inv = invoice as unknown as InvoiceRow;

  // Plátcovství se bere z dokladu (zmrazené při vystavení), ne z aktuálního nastavení firmy —
  // jinak by přepnutí v nastavení zpětně změnilo už odeslané faktury. Neplátce má sazbu 0,
  // takže `total` je u něj rovno základu.
  const vatRegistered = inv.je_platce_dph;
  const amountDue = Number(inv.total);

  const iban = org.bank_account ? accountToIban(org.bank_account) : null;
  let qrDataUrl: string | null = null;
  if (iban) {
    const spayd = buildSpayd({
      iban,
      amount: amountDue,
      variableSymbol: inv.variabilni_symbol,
      message: inv.name,
    });
    qrDataUrl = await generateQrPaymentDataUrl(spayd);
  }

  const customerName = inv.contact ? formatContactName(inv.contact) : "—";
  const billTo = inv.odberatel_je_firma ? (inv.contact?.account ?? null) : null;

  const data: InvoicePdfData = {
    number: inv.number,
    name: inv.name,
    variabilniSymbol: inv.variabilni_symbol,
    datumVystaveni: inv.datum_vystaveni,
    datumSplatnosti: inv.datum_splatnosti,
    datumZdanitelnehoPlneni: inv.datum_zdanitelneho_plneni,
    formaUhrady: inv.forma_uhrady?.label ?? null,
    supplier: {
      name: org.supplier_name || org.name,
      ico: org.ico,
      dic: org.dic,
      address: buildAddressQuery(org),
      logoUrl: org.logo_url,
    },
    // Na koho se vystavuje, rozhoduje pole na dokladu (dřív to bylo napevno "firma, když ji
    // kontakt má", což nešlo použít, když si zaměstnanec firmy objedná projekt soukromě).
    // U osoby se tiskne její vlastní adresa — bez ní by doklad vyšel bez adresy odběratele.
    customer: {
      name: billTo?.name ?? customerName,
      ico: billTo?.ico ?? inv.contact?.ico ?? null,
      address: billTo ? buildAddressQuery(billTo) : inv.contact ? buildAddressQuery(inv.contact) : null,
      contactName: billTo ? customerName : null,
      contactEmail: inv.contact?.email ?? null,
    },
    vatRegistered: vatRegistered,
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
