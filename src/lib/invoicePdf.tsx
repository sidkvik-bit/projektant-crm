import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";

// Stejný font jako quotePdf.tsx (Helvetica neumí českou diakritiku) — registrace je per-proces
// idempotentní, ale react-pdf si stěžuje na duplicitní jméno rodiny, proto sdílíme "PT Sans".
Font.register({
  family: "PT Sans",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/PTSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(process.cwd(), "src/assets/fonts/PTSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: { fontFamily: "PT Sans", fontSize: 10, padding: 40, color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  logo: { width: 48, height: 48 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: "bold" },
  muted: { fontSize: 9, color: "#666666" },
  invoiceName: { fontSize: 11, marginBottom: 16, color: "#666666" },
  partiesRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
  partyBox: { flex: 1, backgroundColor: "#f4f4f5", borderRadius: 4, padding: 10 },
  partyLabel: { fontSize: 8, textTransform: "uppercase", color: "#666666", marginBottom: 4, letterSpacing: 0.5 },
  partyName: { fontWeight: "bold", marginBottom: 2 },
  datesRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 16, padding: 10, backgroundColor: "#f4f4f5", borderRadius: 4 },
  dateItem: { minWidth: 110 },
  dateLabel: { fontSize: 8, textTransform: "uppercase", color: "#666666", marginBottom: 2 },
  dateValue: { fontWeight: "bold" },
  table: { borderTopWidth: 1, borderTopColor: "#dddddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeeee", paddingVertical: 6 },
  tableHeaderRow: { backgroundColor: "#f4f4f5", fontWeight: "bold" },
  cell: { fontSize: 9 },
  cellName: { flex: 3 },
  cellNum: { flex: 1, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 220, marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsFinal: { borderTopWidth: 1, borderTopColor: "#1a1a1a", marginTop: 4, paddingTop: 6, fontWeight: "bold", fontSize: 11 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 24 },
  paymentDetails: { fontSize: 9, lineHeight: 1.6 },
  qrImage: { width: 90, height: 90 },
  qrCaption: { fontSize: 7, color: "#666666", textAlign: "center", marginTop: 2 },
  noteBox: { marginTop: 16, padding: 10, backgroundColor: "#f4f4f5", borderRadius: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999999", textAlign: "center" },
});

const currencyFormat = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("cs-CZ") : "—");

export interface InvoicePdfItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoicePdfData {
  number: string;
  name: string;
  variabilniSymbol: string | null;
  datumVystaveni: string;
  datumSplatnosti: string | null;
  datumZdanitelnehoPlneni: string | null;
  formaUhrady: string | null;
  supplier: { name: string; ico: string | null; dic: string | null; address: string | null; logoUrl: string | null };
  customer: {
    name: string;
    ico: string | null;
    address: string | null;
    contactName: string | null;
    contactEmail: string | null;
  };
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  note: string | null;
  items: InvoicePdfItem[];
  bankAccount: string | null;
  iban: string | null;
  /** Předrenderovaný QR Platba obrázek (data: URL) — `null` když chybí bankovní účet/token. */
  qrDataUrl: string | null;
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document title={`${data.number} – ${data.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {data.supplier.logoUrl ? <Image src={data.supplier.logoUrl} style={styles.logo} /> : <View />}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>FAKTURA – DAŇOVÝ DOKLAD</Text>
            <Text style={styles.title}>{data.number}</Text>
          </View>
        </View>
        <Text style={styles.invoiceName}>{data.name}</Text>

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Dodavatel</Text>
            <Text style={styles.partyName}>{data.supplier.name}</Text>
            {data.supplier.ico ? <Text>IČO: {data.supplier.ico}</Text> : null}
            {data.supplier.dic ? <Text>DIČ: {data.supplier.dic}</Text> : null}
            {data.supplier.address ? <Text>{data.supplier.address}</Text> : null}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Odběratel</Text>
            <Text style={styles.partyName}>{data.customer.name}</Text>
            {data.customer.address ? <Text>{data.customer.address}</Text> : null}
            {data.customer.ico ? <Text>IČO: {data.customer.ico}</Text> : null}
            {data.customer.contactName ? <Text>{data.customer.contactName}</Text> : null}
            {data.customer.contactEmail ? <Text style={styles.muted}>{data.customer.contactEmail}</Text> : null}
          </View>
        </View>

        <View style={styles.datesRow}>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Datum vystavení</Text>
            <Text style={styles.dateValue}>{formatDate(data.datumVystaveni)}</Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Datum zdanitelného plnění</Text>
            <Text style={styles.dateValue}>{formatDate(data.datumZdanitelnehoPlneni)}</Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Datum splatnosti</Text>
            <Text style={styles.dateValue}>{formatDate(data.datumSplatnosti)}</Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Variabilní symbol</Text>
            <Text style={styles.dateValue}>{data.variabilniSymbol ?? "—"}</Text>
          </View>
          <View style={styles.dateItem}>
            <Text style={styles.dateLabel}>Forma úhrady</Text>
            <Text style={styles.dateValue}>{data.formaUhrady ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.cell, styles.cellName]}>Popis</Text>
            <Text style={[styles.cell, styles.cellNum]}>Množství</Text>
            <Text style={[styles.cell, styles.cellNum]}>Jedn. cena</Text>
            <Text style={[styles.cell, styles.cellNum]}>Celkem</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.cell, styles.cellName]}>{item.name}</Text>
              <Text style={[styles.cell, styles.cellNum]}>
                {item.quantity} {item.unit}
              </Text>
              <Text style={[styles.cell, styles.cellNum]}>{currencyFormat.format(item.unitPrice)}</Text>
              <Text style={[styles.cell, styles.cellNum]}>{currencyFormat.format(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Mezisoučet</Text>
            <Text>{currencyFormat.format(data.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>DPH ({data.vatRate}%)</Text>
            <Text>{currencyFormat.format(data.vatAmount)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsFinal]}>
            <Text>Celkem k úhradě</Text>
            <Text>{currencyFormat.format(data.total)}</Text>
          </View>
        </View>

        <View style={styles.paymentRow}>
          <View style={styles.paymentDetails}>
            {data.bankAccount ? <Text>Číslo účtu: {data.bankAccount}</Text> : null}
            {data.iban ? <Text>IBAN: {data.iban}</Text> : null}
            {data.variabilniSymbol ? <Text>Variabilní symbol: {data.variabilniSymbol}</Text> : null}
            {!data.bankAccount ? <Text style={styles.muted}>Bankovní účet není nastaven.</Text> : null}
          </View>
          {data.qrDataUrl ? (
            <View>
              <Image src={data.qrDataUrl} style={styles.qrImage} />
              <Text style={styles.qrCaption}>QR Platba</Text>
            </View>
          ) : null}
        </View>

        {data.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.partyLabel}>Poznámka</Text>
            <Text>{data.note}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {data.supplier.name} · Faktura {data.number}
        </Text>
      </Page>
    </Document>
  );
}
