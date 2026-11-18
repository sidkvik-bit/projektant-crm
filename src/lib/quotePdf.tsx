import path from "node:path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { formatPhasePrice } from "./quoteDocument";

// Rozvržení přesně podle referenčního vzoru kanceláře (Vzor_CN_VHarch.html): A4, rozměry v mm,
// Roboto Light, patička Roboto Italic. Standardní PDF fonty neumí českou diakritiku, Roboto
// (Apache 2.0, bundlovaná v repu) ano.
// Cesty doslova (ne skládané z proměnné) — jinak je Next.js při nasazení nepřibalí.
Font.register({
  family: "Roboto",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/Roboto-Light.ttf"), fontWeight: 300 },
    { src: path.join(process.cwd(), "src/assets/fonts/Roboto-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/assets/fonts/Roboto-LightItalic.ttf"), fontWeight: 300, fontStyle: "italic" },
    { src: path.join(process.cwd(), "src/assets/fonts/Roboto-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
  ],
});
// Dlouhá slova (názvy obcí) nedělit — react-pdf by jinak lámal se spojovníkem.
Font.registerHyphenationCallback((word) => [word]);

const mm = (value: number) => (value * 72) / 25.4;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontWeight: 300,
    fontSize: 11,
    lineHeight: 1.3,
    color: "#000000",
    paddingTop: mm(13),
    paddingRight: mm(25),
    paddingLeft: mm(21),
    // Místo pro patičku (začíná 275 mm od horního okraje), obsah se do ní nesmí dostat.
    paddingBottom: mm(297 - 272),
  },
  logo: { position: "absolute", top: mm(13), right: mm(25), width: mm(53), objectFit: "contain" },
  h1: { fontSize: 15, textDecoration: "underline", marginTop: mm(19), marginBottom: mm(4.5) },
  label: { marginBottom: mm(3.5) },
  block: { marginBottom: mm(4) },
  strong: { fontWeight: 400 },
  phaseTitle: { fontWeight: 400, textDecoration: "underline", marginBottom: mm(3.5) },
  list: { marginBottom: mm(5) },
  listItem: { flexDirection: "row" },
  bullet: { width: mm(13), paddingLeft: mm(6.5) },
  listText: { flex: 1 },
  priceBox: {
    borderWidth: 0.75,
    borderColor: "#000000",
    marginLeft: mm(-2),
    marginRight: mm(-2),
    marginBottom: mm(5),
    paddingTop: mm(0.6),
    paddingBottom: mm(0.6),
    paddingLeft: mm(2),
    paddingRight: mm(13),
    alignItems: "flex-end",
  },
  price: { fontWeight: 400, textDecoration: "underline" },
  totals: { alignItems: "flex-end", marginTop: mm(-2), marginBottom: mm(6) },
  notes: { fontSize: 9.5, lineHeight: 1.3, marginTop: mm(2) },
  placeDate: {
    marginTop: mm(9),
    marginRight: mm(7),
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    left: mm(13),
    right: mm(13),
    top: mm(275),
    borderTopWidth: 0.75,
    borderTopColor: "#000000",
    paddingTop: mm(4),
    flexDirection: "row",
    justifyContent: "center",
    gap: mm(6),
    fontSize: 9,
    fontStyle: "italic",
    fontWeight: 400,
  },
});

export interface QuotePdfPhase {
  nazev: string;
  odrazky: string[];
  cena: number;
}

export interface QuotePdfSupplier {
  jmeno: string;
  adresa: string;
  ico: string | null;
  dic: string | null;
  jePlatceDph: boolean;
  email: string | null;
  telefon: string | null;
  web: string | null;
  mistoVystaveni: string | null;
  logoUrl: string | null;
}

export interface QuotePdfData {
  /** Číslo se netiskne (vzor), jen do metadat PDF. */
  number: string;
  nazevStavby: string;
  supplier: QuotePdfSupplier;
  zadavatel: string;
  phases: QuotePdfPhase[];
  showTotal: boolean;
  /** Plátcovství zmrazené na nabídce; neplátci se DPH netiskne. */
  vatRegistered: boolean;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  notes: string[];
  issuedAt: string;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

/** react-pdf neumí SVG přes <Image> — takové logo radši vynechat, než shodit celé PDF. */
const isRasterLogo = (url: string | null): url is string => !!url && !/\.svg(\?|$)/i.test(url);

function Bullets({ items, style }: { items: string[]; style?: { marginBottom?: number } }) {
  return (
    <View style={[styles.list, style ?? {}]}>
      {items.map((item, i) => (
        <View key={i} style={styles.listItem} wrap={false}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function QuotePdfDocument({ data }: { data: QuotePdfData }) {
  const s = data.supplier;
  const footer = [s.jmeno, s.email, s.telefon, s.web].filter(Boolean) as string[];
  const ico = s.ico ? `IČ: ${s.ico}${s.jePlatceDph ? "" : " (neplátce DPH)"}` : s.jePlatceDph ? null : "neplátce DPH";

  return (
    <Document title={`Cenová nabídka ${data.number} – ${data.nazevStavby}`} author={s.jmeno}>
      <Page size="A4" style={styles.page}>
        {isRasterLogo(s.logoUrl) ? <Image src={s.logoUrl} style={styles.logo} fixed /> : null}

        <Text style={styles.h1}>Cenová nabídka</Text>

        <Text style={styles.label}>Název:</Text>
        <Text style={[styles.block, styles.strong]}>{data.nazevStavby}</Text>

        <Text style={styles.label}>Dodavatel:</Text>
        <View style={styles.block}>
          <Text>{s.jmeno}</Text>
          {s.adresa ? <Text>{s.adresa}</Text> : null}
          {ico ? <Text>{ico}</Text> : null}
          {s.jePlatceDph && s.dic ? <Text>DIČ: {s.dic}</Text> : null}
        </View>

        <Text style={styles.label}>Zadavatel:</Text>
        <Text style={styles.block}>{data.zadavatel || "—"}</Text>

        <Text style={styles.label}>Rozsah:</Text>
        {data.phases.map((phase, i) => (
          <View key={i}>
            <Text style={styles.phaseTitle} minPresenceAhead={mm(15)}>
              {i + 1}/ {phase.nazev}:
            </Text>
            {phase.odrazky.length > 0 ? <Bullets items={phase.odrazky} /> : null}
            <View style={styles.priceBox} wrap={false}>
              <Text style={styles.price}>{formatPhasePrice(phase.cena)}</Text>
            </View>
          </View>
        ))}

        {data.showTotal ? (
          <View style={styles.totals} wrap={false}>
            {data.vatRegistered ? (
              <>
                <Text>Celkem bez DPH: {formatPhasePrice(data.subtotal)}</Text>
                <Text>
                  DPH {data.vatRate} %: {formatPhasePrice(data.vatAmount)}
                </Text>
                <Text style={styles.strong}>Celkem s DPH: {formatPhasePrice(data.total)}</Text>
              </>
            ) : (
              <Text style={styles.strong}>Celkem: {formatPhasePrice(data.total)}</Text>
            )}
          </View>
        ) : null}

        {data.notes.length > 0 ? (
          <View style={styles.notes}>
            <Text>pozn.</Text>
            <Bullets items={data.notes} style={{ marginBottom: 0 }} />
          </View>
        ) : null}

        <View style={styles.placeDate} wrap={false}>
          <Text>{s.mistoVystaveni ?? ""}</Text>
          <Text>{formatDate(data.issuedAt)}</Text>
        </View>

        {footer.length > 0 ? (
          <View style={styles.footer} fixed>
            {footer.flatMap((part, i) => (i > 0 ? ["I", part] : [part])).map((part, i) => (
              <Text key={i}>{part}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
