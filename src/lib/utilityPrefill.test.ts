import { describe, expect, it } from "vitest";
import { buildPrefillSummary, UTILITY_PROVIDERS } from "./utilityPrefill";

describe("UTILITY_PROVIDERS", () => {
  it("has 9 providers, each with a key/label/url", () => {
    expect(UTILITY_PROVIDERS).toHaveLength(9);
    for (const p of UTILITY_PROVIDERS) {
      expect(p.key).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.url).toMatch(/^https:\/\//);
    }
  });

  it("has unique keys", () => {
    expect(new Set(UTILITY_PROVIDERS.map((p) => p.key)).size).toBe(UTILITY_PROVIDERS.length);
  });
});

describe("buildPrefillSummary", () => {
  it("renders every field on its own line when everything is filled in", () => {
    const summary = buildPrefillSummary({
      applicantName: "NAVERTICA a.s.",
      applicantIco: "25585207",
      applicantLegalForm: "Akciová společnost",
      applicantAddress: "Maříkova 2287/1a, 62100 Brno, Česká republika",
      contactName: "Jan Novák",
      contactPhone: "+420 777 123 456",
      contactEmail: "jan@example.com",
      locationAddress: "Ulice 5, 12345 Město, Česká republika",
      gps: { lat: 49.23, lng: 16.58 },
      katastralniUzemi: "Řečkovice",
      parcelniCislo: "123/4",
    });

    expect(summary).toContain("Žadatel: NAVERTICA a.s.");
    expect(summary).toContain("IČO: 25585207");
    expect(summary).toContain("Právní forma: Akciová společnost");
    expect(summary).toContain("Kontaktní osoba: Jan Novák");
    expect(summary).toContain("Telefon: +420 777 123 456");
    expect(summary).toContain("GPS: 49.230000, 16.580000");
    expect(summary).toContain("Katastrální území: Řečkovice");
    expect(summary).toContain("Parcelní číslo: 123/4");
  });

  it("falls back to an em dash for every missing field instead of blank/undefined", () => {
    const summary = buildPrefillSummary({
      applicantName: "NAVERTICA a.s.",
      applicantIco: null,
      applicantLegalForm: null,
      applicantAddress: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      locationAddress: null,
      gps: null,
      katastralniUzemi: null,
      parcelniCislo: null,
    });

    expect(summary).not.toMatch(/undefined|null/);
    expect(summary).toContain("IČO: —");
    expect(summary).toContain("GPS: —");
  });
});
