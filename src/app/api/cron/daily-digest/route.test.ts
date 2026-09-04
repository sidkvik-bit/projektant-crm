import { describe, expect, it } from "vitest";
import { renderDigestHtml } from "./route";

const milestone = (name: string, date: string, projectName: string | null = "Rodinný dům Nováková") => ({
  id: "m1",
  name,
  termin_splneni: date,
  splneno: false,
  projects: projectName ? { name: projectName } : null,
});

describe("renderDigestHtml", () => {
  it("greets the recipient by first name when known", () => {
    const html = renderDigestHtml({ firstName: "Jana", dueToday: [], overdue: [] });
    expect(html).toContain("Ahoj Jana,");
  });

  it("falls back to a generic greeting when the first name is unknown", () => {
    const html = renderDigestHtml({ firstName: null, dueToday: [], overdue: [] });
    expect(html).toContain("Ahoj,");
    expect(html).not.toContain("Ahoj null");
  });

  it("omits the 'Po termínu' section entirely when there is nothing overdue", () => {
    const html = renderDigestHtml({ firstName: "Jana", dueToday: [milestone("Studie", "2026-06-01")], overdue: [] });
    expect(html).not.toContain("Po termínu");
    expect(html).toContain("Na dnešek");
    expect(html).toContain("Studie");
  });

  it("omits the 'Na dnešek' section entirely when nothing is due today", () => {
    const html = renderDigestHtml({ firstName: "Jana", dueToday: [], overdue: [milestone("DSP", "2026-05-20")] });
    expect(html).not.toContain("Na dnešek");
    expect(html).toContain("Po termínu");
    expect(html).toContain("DSP");
  });

  it("includes the project's name next to the milestone when it's linked to one", () => {
    const html = renderDigestHtml({
      firstName: "Jana",
      dueToday: [milestone("Studie", "2026-06-01", "Rodinný dům Nováková")],
      overdue: [],
    });
    expect(html).toContain("Studie — Rodinný dům Nováková");
  });

  it("still renders the milestone when it has no project attached, without a dangling separator", () => {
    const html = renderDigestHtml({
      firstName: "Jana",
      dueToday: [milestone("Studie", "2026-06-01", null)],
      overdue: [],
    });
    expect(html).toContain("Studie (2026-06-01)");
    expect(html).not.toContain("Studie — (2026-06-01)");
  });
});
