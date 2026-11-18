import { describe, expect, it } from "vitest";
import { computeMilestoneDueDates } from "./milestoneDates";

describe("computeMilestoneDueDates", () => {
  it("adds each template milestone's offset_dni to the project's start date", () => {
    const result = computeMilestoneDueDates(
      [
        { name: "Studie", offset_dni: 14 },
        { name: "DSP", offset_dni: 60 },
      ],
      "2026-01-01",
    );
    expect(result).toEqual([
      { name: "Studie", description: null, termin_splneni: "2026-01-15", splneno: false },
      { name: "DSP", description: null, termin_splneni: "2026-03-02", splneno: false },
    ]);
  });

  it("falls back to today when the project has no start date yet", () => {
    const today = new Date("2026-06-01T00:00:00.000Z");
    const result = computeMilestoneDueDates([{ name: "Kickoff", offset_dni: 0 }], null, today);
    expect(result[0].termin_splneni).toBe("2026-06-01");
  });

  it("handles a zero offset (due immediately at the start date)", () => {
    const result = computeMilestoneDueDates([{ name: "Zahájení", offset_dni: 0 }], "2026-03-10");
    expect(result[0].termin_splneni).toBe("2026-03-10");
  });

  it("preserves template order and produces one row per template milestone", () => {
    const templates = [
      { name: "A", offset_dni: 5 },
      { name: "B", offset_dni: 1 },
      { name: "C", offset_dni: 100 },
    ];
    const result = computeMilestoneDueDates(templates, "2026-01-01");
    expect(result.map((m) => m.name)).toEqual(["A", "B", "C"]);
    expect(result).toHaveLength(3);
  });

  it("every generated milestone starts as not completed", () => {
    const result = computeMilestoneDueDates([{ name: "Studie", offset_dni: 14 }], "2026-01-01");
    expect(result.every((m) => m.splneno === false)).toBe(true);
  });

  it("copies the template milestone description, trimming blanks to null", () => {
    const result = computeMilestoneDueDates(
      [
        { name: "Studie", offset_dni: 14, description: "Půdorysy, pohledy, vizualizace" },
        { name: "DSP", offset_dni: 60, description: "   " },
      ],
      "2026-01-01",
    );
    expect(result.map((m) => m.description)).toEqual(["Půdorysy, pohledy, vizualizace", null]);
  });
});
