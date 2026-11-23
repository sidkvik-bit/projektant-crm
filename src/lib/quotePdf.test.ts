import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotePdfDocument, countPdfPages, renderQuotePdf, type QuotePdfData } from "./quotePdf";

/** Nabídka s jednou fází o `bullets` odrážkách — počtem odrážek se řídí délka. */
const quote = (bullets: number): QuotePdfData => ({
  number: "CN-2026-001",
  nazevStavby: "Stavební úpravy rodinného domu",
  supplier: {
    jmeno: "Ing. arch. Václav Hájek",
    adresa: "Pod zelenou cestou 1759, 511 01 Turnov",
    ico: "01597574",
    dic: null,
    jePlatceDph: false,
    email: "vharchitekti@gmail.com",
    telefon: "+420 776 247 997",
    web: "www.vharch.cz",
    mistoVystaveni: "V Turnově",
    logoUrl: null,
  },
  zadavatel: "Martin Mihaljevič",
  phases: [{ nazev: "Studie", cena: 55000, odrazky: Array.from({ length: bullets }, (_, i) => `Odrážka ${i + 1}`) }],
  showTotal: true,
  vatRegistered: false,
  vatRate: 21,
  subtotal: 55000,
  vatAmount: 0,
  total: 55000,
  notes: ["Poznámka 1", "Poznámka 2", "Poznámka 3", "Poznámka 4", "Poznámka 5"],
  issuedAt: "2026-11-23",
});

const pagesAtNormalSpacing = async (data: QuotePdfData) =>
  countPdfPages(await renderToBuffer(createElement(QuotePdfDocument, { data }) as Parameters<typeof renderToBuffer>[0]));

describe("renderQuotePdf", () => {
  it("nabídku, která přeteče jen o kousek, stáhne zmenšením mezer na jednu stranu", async () => {
    const data = quote(20);
    expect(await pagesAtNormalSpacing(data)).toBe(2);
    expect(countPdfPages(await renderQuotePdf(data))).toBe(1);
  }, 30000);

  it("dlouhou nabídku nechá na víc stranách s normálními mezerami", async () => {
    const data = quote(40);
    expect(countPdfPages(await renderQuotePdf(data))).toBe(2);
  }, 30000);

  it("krátkou nabídku vyrenderuje na jednu stranu napoprvé", async () => {
    expect(countPdfPages(await renderQuotePdf(quote(3)))).toBe(1);
  }, 30000);
});
