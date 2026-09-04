import { describe, expect, it } from "vitest";
import { resolveStatusTone } from "./statusColor";

describe("resolveStatusTone", () => {
  it("returns neutral for a missing label", () => {
    expect(resolveStatusTone(null)).toBe("neutral");
    expect(resolveStatusTone(undefined)).toBe("neutral");
    expect(resolveStatusTone("")).toBe("neutral");
  });

  it("is deterministic — the same label always gets the same tone", () => {
    expect(resolveStatusTone("Probíhá")).toBe(resolveStatusTone("Probíhá"));
    expect(resolveStatusTone("Pozastaveno / čeká")).toBe(resolveStatusTone("Pozastaveno / čeká"));
  });

  it("gives different labels a chance to land on different tones (not a constant)", () => {
    const tones = new Set(
      ["Probíhá", "Pozastaveno / čeká", "Koncept", "Dokončeno", "Zrušeno"].map(resolveStatusTone),
    );
    expect(tones.size).toBeGreaterThan(1);
  });
});
