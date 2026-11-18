import { describe, expect, it } from "vitest";
import { addMonths, formatAddressLine, formatClientLine, formatPhasePrice, parseLines, quoteFileName } from "./quoteDocument";

describe("formatPhasePrice", () => {
  it("formátuje jako ve vzoru, s nezlomitelnou mezerou", () => {
    expect(formatPhasePrice(25000)).toBe("25 000,-");
    expect(formatPhasePrice(1250000)).toBe("1 250 000,-");
    expect(formatPhasePrice(900)).toBe("900,-");
  });

  it("nulu ukáže jako nevyplněnou cenu, ne jako zdarma", () => {
    expect(formatPhasePrice(0)).toBe("[cena]");
  });
});

describe("parseLines", () => {
  it("jeden řádek = jedna odrážka, prázdné řádky vynechá", () => {
    expect(parseLines("situace\r\n\n  řez \npohledy\n")).toEqual(["situace", "řez", "pohledy"]);
    expect(parseLines(null)).toEqual([]);
  });
});

describe("formatAddressLine / formatClientLine", () => {
  it("ulice s číslem, PSČ a obec", () => {
    expect(formatAddressLine({ street: "Pod zelenou cestou", houseNumber: "1759", zip: "511 01", city: "Turnov" })).toBe(
      "Pod zelenou cestou 1759, 511 01 Turnov",
    );
  });

  it("obec bez ulic dostane „č. p.“", () => {
    expect(formatClientLine("Martin Bušanovský", { houseNumber: "261", zip: "512 06", city: "Benešov u Semil" })).toBe(
      "Martin Bušanovský, č. p. 261, 512 06 Benešov u Semil",
    );
  });

  it("bez adresy jen jméno", () => {
    expect(formatClientLine("Eva Bušanská", {})).toBe("Eva Bušanská");
  });
});

describe("addMonths", () => {
  it("přičte měsíce", () => {
    expect(addMonths(3, new Date("2026-11-02T12:00:00Z"))).toBe("2027-02-02");
  });

  it("konec měsíce nepřeteče do dalšího", () => {
    expect(addMonths(3, new Date("2026-11-30T12:00:00Z"))).toBe("2027-02-28");
  });
});

describe("quoteFileName", () => {
  it("skládá kódy fází a příjmení zadavatele", () => {
    expect(quoteFileName(["PAS", "STU"], "Martin Bušanovský, č. p. 261, 512 06 Benešov", "CN-2026-001")).toBe(
      "Cenová nabídka_PAS+STU_Bušanovský",
    );
  });

  it("bez fází a zadavatele použije číslo", () => {
    expect(quoteFileName([], null, "CN-2026-001")).toBe("Cenová nabídka_CN-2026-001");
  });
});
