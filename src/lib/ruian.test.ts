import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMatchAddr, resolveRuian, suggestRuian } from "./ruian";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseMatchAddr", () => {
  // Všechny vstupy níž jsou skutečné odpovědi geokódovací služby ČÚZK, ne vymyšlené tvary.
  it("splits the usual street/číslo popisné/orientační form", () => {
    expect(parseMatchAddr("Husova 390/3, Lány, 56802 Svitavy")).toEqual({
      label: "Husova 390/3, Lány, 56802 Svitavy",
      street: "Husova",
      houseNumber: "390/3",
      city: "Svitavy",
      zip: "568 02",
    });
  });

  it("handles an address with no část obce in the middle", () => {
    expect(parseMatchAddr("Husova 3, 34961 Kladruby")).toEqual({
      label: "Husova 3, 34961 Kladruby",
      street: "Husova",
      houseNumber: "3",
      city: "Kladruby",
      zip: "349 61",
    });
  });

  it("keeps digits and dots that belong to the street name", () => {
    expect(parseMatchAddr("5. května 1142/10, Nusle, 14000 Praha 4")).toMatchObject({
      street: "5. května",
      houseNumber: "1142/10",
      city: "Praha 4",
    });
    expect(parseMatchAddr("Hlavní třída 1063/1, Poruba, 70800 Ostrava")).toMatchObject({
      street: "Hlavní třída",
      houseNumber: "1063/1",
    });
  });

  it("leaves the street empty where the obec has no street names", () => {
    expect(parseMatchAddr("č.p. 62, 51263 Ktová")).toEqual({
      label: "č.p. 62, 51263 Ktová",
      street: null,
      houseNumber: "62",
      city: "Ktová",
      zip: "512 63",
    });
    expect(parseMatchAddr("č.ev. 6, 51263 Ktová")).toMatchObject({ street: null, houseNumber: "6" });
  });

  it("falls back to the raw last part when it is not PSČ + obec", () => {
    expect(parseMatchAddr("Turnov 1247/3")).toMatchObject({ city: "Turnov 1247/3", zip: null });
  });
});

describe("suggestRuian", () => {
  it("keeps only adresní místa — the service mixes obce, ulice and parcely into the same list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          suggestions: [
            { text: "Husova (Liberec)", magicKey: "a", type: "ZakladniSidelniJednotka" },
            { text: "Husova, Liberec", magicKey: "b", type: "Ulice" },
            { text: "Turnov 1247/3", magicKey: "c", type: "ParcelaDefinicniBod" },
            { text: "Husova 348/31, Liberec I-Staré Město, 46001 Liberec", magicKey: "d", type: "AdresniMisto" },
          ],
        }),
      }),
    );

    expect(await suggestRuian("Husova 31 Liberec")).toEqual([
      { text: "Husova 348/31, Liberec I-Staré Město, 46001 Liberec", magicKey: "d" },
    ]);
  });
});

describe("resolveRuian", () => {
  it("returns parsed fields plus WGS84 coordinates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            address: "Husova 348/31, Liberec I-Staré Město, 46001 Liberec",
            location: { x: 15.06545080188843, y: 50.77108713459349 },
            attributes: { Type: "AdresniMisto" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveRuian("Husova 348/31, 46001 Liberec", "1_123")).toEqual({
      label: "Husova 348/31, Liberec I-Staré Město, 46001 Liberec",
      street: "Husova",
      houseNumber: "348/31",
      city: "Liberec",
      zip: "460 01",
      lat: 50.77108713459349,
      lng: 15.06545080188843,
    });

    // Bez outSR chodí S-JTSK (záporné metry), což by do gps_lat/gps_lng zapsalo nesmysl.
    const url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("magicKey")).toBe("1_123");
  });

  it("returns null when the service finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) }));
    expect(await resolveRuian("neexistuje", "x")).toBeNull();
  });

  it("throws on an HTTP error so the route can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(resolveRuian("Husova 3", "x")).rejects.toThrow(/503/);
  });
});
