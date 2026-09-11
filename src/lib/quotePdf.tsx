import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";

// Standardní PDF fonty (Helvetica) neumí českou diakritiku (WinAnsi encoding) — PT Sans
// (OFL licence, staticky bundlovaná v repu) pokrývá celou českou znakovou sadu.
Font.register({
  family: "PT Sans",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/PTSans-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(process.cwd(), "src/assets/fonts/PTSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: { fontFamily: "PT Sans", fontSize: 10, padding: 40, color: "#1a1a1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  logoBlock: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 36, height: 36 },
  orgName: { fontSize: 14, fontWeight: "bold" },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  muted: { fontSize: 9, color: "#666666" },
  quoteName: { fontSize: 12, fontWeight: "bold", marginBottom: 16 },
  partiesRow: { flexDirection: "row", gap: 24, marginBottom: 24 },
  partyBox: { flex: 1, backgroundColor: "#f4f4f5", borderRadius: 4, padding: 10 },
  partyLabel: { fontSize: 8, textTransform: "uppercase", color: "#666666", marginBottom: 4, letterSpacing: 0.5 },
  table: { borderTopWidth: 1, borderTopColor: "#dddddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeeee", paddingVertical: 6 },
  tableHeaderRow: { backgroundColor: "#f4f4f5", fontWeight: "bold" },
  cell: { fontSize: 9 },
  cellName: { flex: 3 },
  cellNum: { flex: 1, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 220, marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsFinal: { borderTopWidth: 1, borderTopColor: "#1a1a1a", marginTop: 4, paddingTop: 6, fontWeight: "bold", fontSize: 11 },
  noteBox: { marginTop: 24, padding: 10, backgroundColor: "#f4f4f5", borderRadius: 4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999999", textAlign: "center" },
});

const currencyFormat = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("cs-CZ") : "—");

export interface QuotePdfItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}

export interface QuotePdfData {
  organizationName: string;
  organizationLogoUrl: string | null;
  number: string;
  name: string;
  createdAt: string;
  validUntil: string | null;
  projectName: string;
  accountName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  note: string | null;
  items: QuotePdfItem[];
}

export function QuotePdfDocument({ data }: { data: QuotePdfData }) {
  return (
    <Document title={`${data.number} – ${data.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.logoBlock}>
            {data.organizationLogoUrl ? <Image src={data.organizationLogoUrl} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{data.organizationName}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>Nabídka {data.number}</Text>
            <Text style={styles.muted}>Vystaveno: {formatDate(data.createdAt)}</Text>
            <Text style={styles.muted}>Platnost do: {formatDate(data.validUntil)}</Text>
          </View>
        </View>

        <Text style={styles.quoteName}>{data.name}</Text>

        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Projekt</Text>
            <Text>{data.projectName}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Objednatel</Text>
            <Text>{data.accountName ?? "—"}</Text>
            {data.contactName ? <Text>{data.contactName}</Text> : null}
            {data.contactEmail ? <Text style={styles.muted}>{data.contactEmail}</Text> : null}
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

        {data.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.partyLabel}>Poznámka</Text>
            <Text>{data.note}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {data.organizationName} · Nabídka {data.number}
        </Text>
      </Page>
    </Document>
  );
}
