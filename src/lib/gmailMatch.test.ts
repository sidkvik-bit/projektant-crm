import { describe, expect, it } from "vitest";
import { extractEmailAddresses, matchRecordsByEmail } from "./gmailMatch";

describe("extractEmailAddresses", () => {
  it("returns an empty array for missing input", () => {
    expect(extractEmailAddresses(null)).toEqual([]);
    expect(extractEmailAddresses(undefined)).toEqual([]);
    expect(extractEmailAddresses("")).toEqual([]);
  });

  it("extracts a single plain address", () => {
    expect(extractEmailAddresses("jan@example.com")).toEqual(["jan@example.com"]);
  });

  it("extracts an address out of a display-name header", () => {
    expect(extractEmailAddresses('"Jan Novák" <jan.novak@example.cz>')).toEqual(["jan.novak@example.cz"]);
  });

  it("extracts multiple comma-separated addresses (To/Cc style)", () => {
    expect(extractEmailAddresses('"Jan Novák" <jan@example.cz>, info@firma.cz')).toEqual([
      "jan@example.cz",
      "info@firma.cz",
    ]);
  });

  it("lowercases and deduplicates addresses", () => {
    expect(extractEmailAddresses("Jan@Example.cz, jan@example.cz")).toEqual(["jan@example.cz"]);
  });
});

describe("matchRecordsByEmail", () => {
  const candidates = [
    { entityType: "Contact", id: "c1", email: "jan@example.cz" },
    { entityType: "Account", id: "a1", email: "info@firma.cz" },
    { entityType: "Lead", id: "l1", email: "jiny@example.cz" },
  ];

  it("matches records whose email appears among the participant addresses", () => {
    const matches = matchRecordsByEmail(["jan@example.cz", "info@firma.cz"], candidates);
    expect(matches).toEqual([
      { entityType: "Contact", entityId: "c1" },
      { entityType: "Account", entityId: "a1" },
    ]);
  });

  it("is case-insensitive", () => {
    const matches = matchRecordsByEmail(["JAN@EXAMPLE.CZ"], candidates);
    expect(matches).toEqual([{ entityType: "Contact", entityId: "c1" }]);
  });

  it("returns nothing when no participant email matches any candidate", () => {
    expect(matchRecordsByEmail(["nobody@nowhere.cz"], candidates)).toEqual([]);
  });

  it("ignores candidates without an email", () => {
    const withBlank = [...candidates, { entityType: "Contact", id: "c2", email: "" }];
    expect(matchRecordsByEmail([""], withBlank)).toEqual([]);
  });

  it("deduplicates the same entity+id even if it matches via multiple participant addresses", () => {
    const dupeCandidates = [{ entityType: "Contact", id: "c1", email: "jan@example.cz" }];
    const matches = matchRecordsByEmail(["jan@example.cz", "JAN@example.cz"], dupeCandidates);
    expect(matches).toEqual([{ entityType: "Contact", entityId: "c1" }]);
  });
});
