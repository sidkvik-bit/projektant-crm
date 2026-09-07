import { describe, expect, it } from "vitest";
import { accountToIban } from "./czechBank";

describe("accountToIban", () => {
  it("matches the verified reference vector (Česká spořitelna example)", () => {
    expect(accountToIban("19-2000145399/0800")).toBe("CZ6508000000192000145399");
  });

  it("works without a prefix", () => {
    // no prefix -> zero-padded to 000000, only the account number + bank code vary
    const iban = accountToIban("2000145399/0800");
    expect(iban).toMatch(/^CZ\d{2}0800000000\d{10}$/);
    expect(iban).toHaveLength(24);
  });

  it("pads a short account number to 10 digits", () => {
    expect(accountToIban("123/0100")).toMatch(/^CZ\d{22}$/);
  });

  it("returns null for input with no bank code", () => {
    expect(accountToIban("2000145399")).toBeNull();
  });

  it("returns null for a non-numeric bank code", () => {
    expect(accountToIban("2000145399/ABCD")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(accountToIban("")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(accountToIban("  19-2000145399/0800  ")).toBe("CZ6508000000192000145399");
  });
});
