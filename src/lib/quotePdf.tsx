import path from "node:path";
import { createElement } from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
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

/**
 * Styly pro danou hustotu: 1 = mezery přesně podle vzoru, menší číslo = svislé mezery úměrně
 * menší (a o chlup menší řádkování). Písmo, okraje stránky, logo ani patička se nemění.
 * Zmenšuje se i mezera nad nadpisem; horní blok (nadpis a název stavby) se pak zúží, aby nevjel
 * pod logo vpravo nahoře (končí 31 mm od horního okraje, levý okraj loga je 57 mm od pravého
 * okraje textu).
 */
function createStyles(density: number) {
  const gap = (value: number) => mm(value * density);
  return StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontWeight: 300,
    fontSize: 11,
    lineHeight: 1.15 + 0.15 * density,
    color: "#000000",
    paddingTop: mm(13),
    paddingRight: mm(25),
    paddingLeft: mm(21),
    // Místo pro patičku (začíná 275 mm od horního okraje), obsah se do ní nesmí dostat.
    paddingBottom: mm(297 - 272),
  },
  logo: { position: "absolute", top: mm(13), right: mm(25), width: mm(53), objectFit: "contain" },
  h1: { fontSize: 15, textDecoration: "underline", marginTop: gap(19), marginBottom: gap(4.5) },
  // Ve vzoru (hustota 1) je nadpis až pod logem a název stavby smí mít celou šířku.
  header: density < 1 ? { paddingRight: mm(57) } : {},
  label: { marginBottom: gap(3.5) },
  block: { marginBottom: gap(4) },
  strong: { fontWeight: 400 },
  phaseTitle: { fontWeight: 400, textDecoration: "underline", marginBottom: gap(3.5) },
  list: { marginBottom: gap(5) },
  listItem: { flexDirection: "row" },
  bullet: { width: mm(13), paddingLeft: mm(6.5) },
  listText: { flex: 1 },
  priceBox: {
    borderWidth: 0.75,
    borderColor: "#000000",
    marginLeft: mm(-2),
    marginRight: mm(-2),
    marginBottom: gap(5),
    paddingTop: mm(0.6),
    paddingBottom: mm(0.6),
    paddingLeft: mm(2),
    paddingRight: mm(13),
    alignItems: "flex-end",
  },
  price: { fontWeight: 400, textDecoration: "underline" },
  totals: { alignItems: "flex-end", marginTop: mm(-2), marginBottom: gap(6) },
  notes: { fontSize: 9.5, lineHeight: 1.15 + 0.15 * density, marginTop: gap(2) },
  placeDate: {
    marginTop: gap(9),
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
}

type Styles = ReturnType<typeof createStyles>;

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

function Bullets({ items, styles, style }: { items: string[]; styles: Styles; style?: { marginBottom?: number } }) {
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

export function QuotePdfDocument({ data, density = 1 }: { data: QuotePdfData; density?: number }) {
  const styles = createStyles(density);
  const s = data.supplier;
  const footer = [s.jmeno, s.email, s.telefon, s.web].filter(Boolean) as string[];
  const ico = s.ico ? `IČ: ${s.ico}${s.jePlatceDph ? "" : " (neplátce DPH)"}` : s.jePlatceDph ? null : "neplátce DPH";

  return (
    <Document title={`Cenová nabídka ${data.number} – ${data.nazevStavby}`} author={s.jmeno}>
      <Page size="A4" style={styles.page}>
        {/* Logo jen na první straně (jako ve vzoru). S `fixed` by se opakovalo na každé straně
            a na pokračování, kde text začíná hned nahoře, by se s ním překrývalo. */}
        {isRasterLogo(s.logoUrl) ? <Image src={s.logoUrl} style={styles.logo} /> : null}

        <View style={styles.header}>
          <Text style={styles.h1}>Cenová nabídka</Text>

          <Text style={styles.label}>Název:</Text>
          <Text style={[styles.block, styles.strong]}>{data.nazevStavby}</Text>
        </View>

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
            {phase.odrazky.length > 0 ? <Bullets items={phase.odrazky} styles={styles} /> : null}
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
            <Bullets items={data.notes} styles={styles} style={{ marginBottom: 0 }} />
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

/** Počet stran hotového PDF (react-pdf zapisuje slovník /Pages nekomprimovaně). */
export function countPdfPages(pdf: Buffer): number {
  const match = /\/Type\s*\/Pages\b[\s\S]*?\/Count\s+(\d+)/.exec(pdf.toString("latin1"));
  return match ? Number(match[1]) : 1;
}

/** Hustoty, které se zkouší po řadě, když se nabídka nevejde na jednu stranu. */
const DENSITIES = [1, 0.75, 0.5, 0.3];

/**
 * Vyrenderuje nabídku. Když s mezerami podle vzoru přeteče na druhou stranu (typicky jen datum
 * a místo), zkusí to znovu s menšími mezerami. Když se nevejde ani s nejmenšími, vrátí verzi
 * s normálními mezerami — dlouhá nabídka na víc stran má mít vzdušné rozvržení.
 */
export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  let first: Buffer | null = null;
  for (const density of DENSITIES) {
    const pdf = await renderToBuffer(
      createElement(QuotePdfDocument, { data, density }) as Parameters<typeof renderToBuffer>[0],
    );
    if (countPdfPages(pdf) <= 1) return pdf;
    first ??= pdf;
  }
  return first!;
}
