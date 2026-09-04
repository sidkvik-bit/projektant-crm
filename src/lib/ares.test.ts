import { afterEach, describe, expect, it, vi } from "vitest";
import { toAresMatch, lookupAresByIco, searchAresByName } from "./ares";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toAresMatch", () => {
  it("maps an ARES subject to the flat shape the UI needs", () => {
    expect(
      toAresMatch({
        ico: "25585207",
        obchodniJmeno: "NAVERTICA a.s.",
        sidlo: { textovaAdresa: "Maříkova 2287/1a, Řečkovice, 62100 Brno" },
      }),
    ).toEqual({ ico: "25585207", name: "NAVERTICA a.s.", address: "Maříkova 2287/1a, Řečkovice, 62100 Brno" });
  });

  it("falls back to null address when sidlo is missing", () => {
    expect(toAresMatch({ ico: "25585207", obchodniJmeno: "NAVERTICA a.s." })).toEqual({
      ico: "25585207",
      name: "NAVERTICA a.s.",
      address: null,
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
        json: async () => ({ ico: "25585207", obchodniJmeno: "NAVERTICA a.s.", sidlo: { textovaAdresa: "Brno" } }),
      }),
    );
    expect(await lookupAresByIco("25585207")).toEqual({ ico: "25585207", name: "NAVERTICA a.s.", address: "Brno" });
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
            { ico: "25585207", obchodniJmeno: "NAVERTICA a.s.", sidlo: { textovaAdresa: "Brno" } },
            { ico: "06859101", obchodniJmeno: "ELSI CZ s.r.o." },
          ],
        }),
      }),
    );
    expect(await searchAresByName("Nav")).toEqual([
      { ico: "25585207", name: "NAVERTICA a.s.", address: "Brno" },
      { ico: "06859101", name: "ELSI CZ s.r.o.", address: null },
    ]);
  });

  it("returns an empty array when ARES finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await searchAresByName("neexistujici firma xyz")).toEqual([]);
  });
});
