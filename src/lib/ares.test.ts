import { afterEach, describe, expect, it, vi } from "vitest";
import { toAresMatch, lookupAresByIco, searchAresByName } from "./ares";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FULL_SIDLO = {
  nazevUlice: "Maříkova",
  cisloDomovni: 2287,
  cisloOrientacni: 1,
  cisloOrientacniPismeno: "a",
  nazevObce: "Brno",
  psc: 62100,
  nazevStatu: "Česká republika",
  textovaAdresa: "Maříkova 2287/1a, Řečkovice, 62100 Brno",
};

describe("toAresMatch", () => {
  it("maps an ARES subject to the flat shape the UI needs, splitting the address into fields", () => {
    expect(
      toAresMatch({ ico: "25585207", obchodniJmeno: "NAVERTICA a.s.", pravniForma: "121", sidlo: FULL_SIDLO }),
    ).toEqual({
      ico: "25585207",
      name: "NAVERTICA a.s.",
      address: "Maříkova 2287/1a, Řečkovice, 62100 Brno",
      street: "Maříkova",
      houseNumber: "2287/1a",
      city: "Brno",
      zip: "62100",
      country: "Česká republika",
      legalFormCode: "121",
    });
  });

  it("omits the orientační číslo suffix when ARES doesn't have one", () => {
    expect(toAresMatch({ ico: "1", obchodniJmeno: "x", sidlo: { cisloDomovni: 10 } }).houseNumber).toBe("10");
  });

  it("falls back to nulls when sidlo/pravniForma are missing", () => {
    expect(toAresMatch({ ico: "25585207", obchodniJmeno: "NAVERTICA a.s." })).toEqual({
      ico: "25585207",
      name: "NAVERTICA a.s.",
      address: null,
      street: null,
      houseNumber: null,
      city: null,
      zip: null,
      country: null,
      legalFormCode: null,
    });
  });
});

describe("lookupAresByIco", () => {
  it("returns null for a 404 (IČO doesn't exist)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    expect(await lookupAresByIco("00000000")).toBeNull();
  });

  it("returns the mapped match on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ ico: "25585207", obchodniJmeno: "NAVERTICA a.s.", pravniForma: "121", sidlo: FULL_SIDLO }),
      }),
    );
    const match = await lookupAresByIco("25585207");
    expect(match?.legalFormCode).toBe("121");
    expect(match?.city).toBe("Brno");
  });

  it("throws on a non-404 error status, instead of silently returning null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
    await expect(lookupAresByIco("25585207")).rejects.toThrow();
  });
});

describe("searchAresByName", () => {
  it("maps every result in the search response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ekonomickeSubjekty: [
            { ico: "25585207", obchodniJmeno: "NAVERTICA a.s.", pravniForma: "121", sidlo: FULL_SIDLO },
            { ico: "06859101", obchodniJmeno: "ELSI CZ s.r.o." },
          ],
        }),
      }),
    );
    const matches = await searchAresByName("Nav");
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ ico: "25585207", name: "NAVERTICA a.s.", legalFormCode: "121" });
    expect(matches[1]).toMatchObject({ ico: "06859101", name: "ELSI CZ s.r.o.", legalFormCode: null });
  });

  it("returns an empty array when ARES finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await searchAresByName("neexistujici firma xyz")).toEqual([]);
  });
});
