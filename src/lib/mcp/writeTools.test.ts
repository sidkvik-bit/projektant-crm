import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PARCEL_INPUT, PROJECT_ADDRESS_FIELDS } from "./writeTools";

describe("PARCEL_INPUT", () => {
  it("doplní výchozí druh parcely a přijme LV", () => {
    expect(PARCEL_INPUT.parse({ parcelni_cislo: "1247/3", list_vlastnictvi: "1234" })).toEqual({
      parcelni_cislo: "1247/3",
      druh: "pozemkova",
      list_vlastnictvi: "1234",
    });
  });

  // Neznámé pole se nesmí tiše zahodit — model by pak hlásil, že ho uložil.
  it("odmítne neznámé pole místo tichého zahození", () => {
    expect(PARCEL_INPUT.safeParse({ parcelni_cislo: "1", vlastnik: "Novák" }).success).toBe(false);
  });
});

describe("PROJECT_ADDRESS_FIELDS (create_project / update_project)", () => {
  const schema = z.strictObject(PROJECT_ADDRESS_FIELDS);

  it("přijme celou adresu stavby, katastrální území i parcelní číslo", () => {
    const input = {
      address_street: "Legionářů",
      address_house_number: "2240",
      address_city: "Turnov",
      address_zip: "511 01",
      address_country: "Česká republika",
      katastralni_uzemi: "Turnov",
      parcelni_cislo: "1247/3, st. 512",
    };
    expect(schema.parse(input)).toEqual(input);
  });
});
