import { afterEach, describe, expect, it, vi } from "vitest";
import { findCadastres, searchParcels, PARCEL_QUERY_PATTERN } from "./ruianParcels";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Odpovědi ve tvaru, v jakém je vrací mapová služba ČÚZK (ověřeno proti ostré službě). */
function stubResponses(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const TURNOV = { features: [{ attributes: { kod: 771601, nazev: "Turnov" } }] };

describe("PARCEL_QUERY_PATTERN", () => {
  it("accepts kmenové číslo with an optional poddělení", () => {
    for (const ok of ["12", "1247", "1247/", "1247/3"]) expect(PARCEL_QUERY_PATTERN.test(ok)).toBe(true);
  });

  it("rejects anything that could reach the SQL where clause", () => {
    for (const bad of ["1247' or '1'='1", "st. 12", "abc", "", "1247/3/4", "-1"]) {
      expect(PARCEL_QUERY_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("findCadastres", () => {
  it("prefers an exact name — 'Turnov' must not drag in 'Bukovina u Turnova'", async () => {
    const fetchMock = stubResponses(TURNOV);
    expect(await findCadastres("Turnov")).toEqual([{ kod: 771601, nazev: "Turnov" }]);
    // Přesná shoda stačila, na LIKE se vůbec nedošlo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0] as URL).searchParams.get("where")).toBe("nazev = 'Turnov'");
  });

  it("falls back to a prefix search when nothing matches exactly", async () => {
    const fetchMock = stubResponses({ features: [] }, { features: [{ attributes: { kod: 628239, nazev: "Dolánky" } }] });
    expect(await findCadastres("Dolánk")).toEqual([{ kod: 628239, nazev: "Dolánky" }]);
    expect(new URL(fetchMock.mock.calls[1][0] as URL).searchParams.get("where")).toBe("nazev LIKE 'Dolánk%'");
  });

  it("does not call the service for a name that is not a name", async () => {
    const fetchMock = stubResponses();
    expect(await findCadastres("';drop--")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchParcels", () => {
  it("maps the cadastre's own codebook onto our druh, and carries the area", async () => {
    stubResponses(TURNOV, {
      features: [
        { attributes: { cisloparcely: "1247/3", druhcislovanikod: 2, vymeraparcely: 342, katastralniuzemi: 771601 } },
        { attributes: { cisloparcely: "1247/4", druhcislovanikod: 1, vymeraparcely: null, katastralniuzemi: 771601 } },
      ],
    });

    expect(await searchParcels("Turnov", "1247")).toEqual([
      { cisloParcely: "1247/3", druh: "pozemkova", vymeraM2: 342, katastralniUzemi: "Turnov" },
      { cisloParcely: "1247/4", druh: "stavebni", vymeraM2: null, katastralniUzemi: "Turnov" },
    ]);
  });

  it("scopes the query to the found cadastre — a bare number exists in thousands of them", async () => {
    const fetchMock = stubResponses(TURNOV, { features: [] });
    await searchParcels("Turnov", "1247");
    expect(new URL(fetchMock.mock.calls[1][0] as URL).searchParams.get("where")).toBe(
      "katastralniuzemi IN (771601) AND cisloparcely LIKE '1247%'",
    );
  });

  it("returns nothing — and asks nothing — when the parcel number is malformed", async () => {
    const fetchMock = stubResponses();
    expect(await searchParcels("Turnov", "1247' or '1'='1")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing when the katastrální území is unknown", async () => {
    stubResponses({ features: [] }, { features: [] });
    expect(await searchParcels("Neexistuje", "1")).toEqual([]);
  });

  it("throws when the service answers 200 with an error in the body", async () => {
    stubResponses(TURNOV, { error: { message: "Invalid where clause" } });
    await expect(searchParcels("Turnov", "1247")).rejects.toThrow(/Invalid where clause/);
  });

  it("throws on an HTTP error so the route can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(searchParcels("Turnov", "1247")).rejects.toThrow(/503/);
  });
});
