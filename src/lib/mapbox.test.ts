import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAddressQuery,
  parseMapboxFeatureToAddress,
  geocodeAddress,
  reverseGeocode,
  addressFieldsChanged,
} from "./mapbox";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildAddressQuery", () => {
  it("joins all address fields into one query string", () => {
    expect(
      buildAddressQuery({
        address_street: "Maříkova",
        address_house_number: "2287/1a",
        address_city: "Brno",
        address_zip: "62100",
        address_country: "Česká republika",
      }),
    ).toBe("Maříkova 2287/1a, 62100 Brno, Česká republika");
  });

  it("skips missing pieces instead of leaving stray commas/spaces", () => {
    expect(buildAddressQuery({ address_city: "Brno", address_country: "Česká republika" })).toBe(
      "Brno, Česká republika",
    );
  });

  it("returns null when every field is empty", () => {
    expect(buildAddressQuery({})).toBeNull();
    expect(buildAddressQuery({ address_street: "", address_city: null })).toBeNull();
  });
});

describe("addressFieldsChanged", () => {
  const saved = {
    address_street: "Maříkova",
    address_house_number: "2287/1a",
    address_city: "Brno",
    address_zip: "62100",
    address_country: "Česká republika",
  };

  it("is false when the submitted address exactly matches what's saved", () => {
    expect(addressFieldsChanged(saved, { ...saved, budget: 500000 })).toBe(false);
  });

  it("is true when any single address field differs", () => {
    expect(addressFieldsChanged(saved, { ...saved, address_city: "Praha" })).toBe(true);
  });

  it("treats null and undefined as equivalent to 'no value', not as a change from each other", () => {
    expect(addressFieldsChanged({ address_street: null }, { address_street: undefined })).toBe(false);
    expect(addressFieldsChanged({ address_street: undefined }, { address_street: null })).toBe(false);
  });

  it("is true when clearing a previously-set address entirely", () => {
    expect(
      addressFieldsChanged(saved, {
        address_street: "",
        address_house_number: "",
        address_city: "",
        address_zip: "",
        address_country: "",
      }),
    ).toBe(true);
  });
});

describe("parseMapboxFeatureToAddress", () => {
  it("pulls street/houseNumber/city/zip/country out of a Mapbox feature", () => {
    expect(
      parseMapboxFeatureToAddress({
        text: "Maříkova",
        address: "2287",
        center: [16.58, 49.23],
        context: [
          { id: "postcode.123", text: "621 00" },
          { id: "place.456", text: "Brno" },
          { id: "region.789", text: "South Moravian Region" },
          { id: "country.abc", text: "Czechia" },
        ],
      }),
    ).toEqual({ street: "Maříkova", houseNumber: "2287", city: "Brno", zip: "62100", country: "Czechia" });
  });

  it("falls back to nulls when context entries are missing", () => {
    expect(parseMapboxFeatureToAddress({ center: [0, 0] })).toEqual({
      street: null,
      houseNumber: null,
      city: null,
      zip: null,
      country: null,
    });
  });
});

describe("geocodeAddress", () => {
  it("returns null when no token is configured, without making a request", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocodeAddress("Brno")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the first feature's [lng, lat] as {lat, lng}", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [{ center: [16.58, 49.23] }] }) }),
    );
    expect(await geocodeAddress("Brno")).toEqual({ lat: 49.23, lng: 16.58 });
  });

  it("returns null when Mapbox finds no matches", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    expect(await geocodeAddress("nowhere at all")).toBeNull();
  });

  it("returns null (not a throw) when the Mapbox request fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await geocodeAddress("Brno")).toBeNull();
  });
});

describe("reverseGeocode", () => {
  it("returns null when no token is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    expect(await reverseGeocode(49.23, 16.58)).toBeNull();
  });

  it("parses the first feature into an address", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              text: "Maříkova",
              address: "2287",
              center: [16.58, 49.23],
              context: [
                { id: "postcode.1", text: "621 00" },
                { id: "place.1", text: "Brno" },
                { id: "country.1", text: "Czechia" },
              ],
            },
          ],
        }),
      }),
    );
    expect(await reverseGeocode(49.23, 16.58)).toEqual({
      street: "Maříkova",
      houseNumber: "2287",
      city: "Brno",
      zip: "62100",
      country: "Czechia",
    });
  });
});
