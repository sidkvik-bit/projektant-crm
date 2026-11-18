import { describe, expect, it } from "vitest";
import { PARCEL_INPUT } from "./writeTools";

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
