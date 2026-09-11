import { describe, expect, it } from "vitest";
import { buildSpayd, generateQrPaymentDataUrl } from "./qrPayment";

describe("buildSpayd", () => {
  it("builds the full string with every field, matching the official spec's example shape", () => {
    expect(
      buildSpayd({
        iban: "CZ6508000000192000145399",
        amount: 480.5,
        variableSymbol: "20260001",
        dueDate: "2026-09-21",
        message: "Faktura 20260001",
      }),
    ).toBe("SPD*1.0*ACC:CZ6508000000192000145399*AM:480.50*CC:CZK*X-VS:20260001*DT:20260921*MSG:FAKTURA 20260001");
  });

  it("omits optional fields entirely when not provided, rather than emitting empty keys", () => {
    expect(buildSpayd({ iban: "CZ6508000000192000145399", amount: 100 })).toBe(
      "SPD*1.0*ACC:CZ6508000000192000145399*AM:100.00*CC:CZK",
    );
  });

  it("always formats the amount with exactly 2 decimals", () => {
    expect(buildSpayd({ iban: "CZ6508000000192000145399", amount: 1234 })).toContain("AM:1234.00");
    expect(buildSpayd({ iban: "CZ6508000000192000145399", amount: 1234.5 })).toContain("AM:1234.50");
  });

  it("strips non-digit characters from the variable symbol and caps it at 10 characters", () => {
    const s = buildSpayd({ iban: "CZ6508000000192000145399", amount: 1, variableSymbol: "FAK-2026-000111" });
    expect(s).toContain("X-VS:2026000111");
  });

  it("strips Czech diacritics and uppercases the message, per SPAYD compatibility guidance", () => {
    const s = buildSpayd({ iban: "CZ6508000000192000145399", amount: 1, message: "Děkujeme za spolupráci" });
    expect(s).toContain("MSG:DEKUJEME ZA SPOLUPRACI");
  });

  it("formats the due date as YYYYMMDD, not ISO", () => {
    const s = buildSpayd({ iban: "CZ6508000000192000145399", amount: 1, dueDate: "2026-01-05" });
    expect(s).toContain("DT:20260105");
  });
});

describe("generateQrPaymentDataUrl", () => {
  it("produces a PNG data URL", async () => {
    const spayd = buildSpayd({ iban: "CZ6508000000192000145399", amount: 100, variableSymbol: "1" });
    const dataUrl = await generateQrPaymentDataUrl(spayd);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
