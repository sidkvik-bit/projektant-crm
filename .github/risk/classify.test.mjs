// node --test .github/risk/classify.test.mjs — mimo vitest, protože ten sbírá jen src/**/*.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChange, classifyChangeSet } from "./classify.mjs";
import { gateDecision } from "./gate.mjs";

const level = (change) => classifyChange(change).level;

test("běžné soubory jsou zelené", () => {
  assert.equal(level({ path: "src/app/(app)/projects/page.tsx" }), "green");
  assert.equal(level({ path: "src/solutions/Projektant_CRM/Entities/Lead/Entity.json" }), "green");
  assert.equal(level({ path: "e2e/tests/smoke.spec.ts" }), "green");
});

test("pojistky a bezpečnost jsou červené", () => {
  assert.equal(level({ path: ".github/workflows/ci.yml" }), "red");
  assert.equal(level({ path: ".claude/settings.json" }), "red");
  assert.equal(level({ path: ".claude/hooks/risk-gate.mjs" }), "red");
  assert.equal(level({ path: "src/proxy.ts" }), "red");
  assert.equal(level({ path: "src/lib/supabase/admin.ts" }), "red");
  assert.equal(level({ path: "src/lib/mcp/auth.ts" }), "red");
});

test("agenti a skilly v .claude nejsou pojistky", () => {
  assert.equal(level({ path: ".claude/skills/ship-change/SKILL.md" }), "green");
});

test("windowsové cesty se normalizují", () => {
  assert.equal(level({ path: "src\\lib\\supabase\\admin.ts" }), "red");
});

test("nová aditivní migrace je oranžová", () => {
  const sql = `-- Přidá sloupec. Dřív jsme zvažovali drop table, ale ne.
alter table public.projects add column poznamka text;
create policy projects_x_select on public.x for select using (organization_id = public.get_my_organization_id());`;
  assert.equal(level({ path: "supabase/migrations/20261116000000_x.sql", status: "A", addedText: sql }), "orange");
});

test("destruktivní nebo bezpečnostní SQL je červené", () => {
  const red = (sql) => level({ path: "supabase/migrations/20261116000000_x.sql", status: "A", addedText: sql });
  assert.equal(red("alter table public.projects drop column poznamka;"), "red");
  assert.equal(red("delete from public.leads where true;"), "red");
  assert.equal(red("create function f() returns void language sql security definer as $$ select 1 $$;"), "red");
  assert.equal(red("alter table public.x disable row level security;"), "red");
  assert.equal(red("alter table public.x alter column castka type numeric;"), "red");
});

test("úprava už existující migrace je červená", () => {
  assert.equal(level({ path: "supabase/migrations/20260830095332_init_core_schema.sql", status: "M" }), "red");
  assert.equal(level({ path: "supabase/migrations/20260830095332_init_core_schema.sql", status: "D" }), "red");
});

test("sada změn bere nejhorší soubor", () => {
  const result = classifyChangeSet([{ path: "src/app/page.tsx" }, { path: "src/engine/FormEngine.tsx" }]);
  assert.equal(result.level, "orange");
});


test("brána: zelená a oranžová projdou bez schválení", () => {
  assert.equal(gateDecision({ level: "orange", author: "havlinak96", headSha: "b", reviews: [] }).pass, true);
});

test("brána: červená čeká na Honzovo schválení aktuálního commitu", () => {
  const approve = (commit_id, login = "sidkvik-bit") => ({ user: { login }, state: "APPROVED", commit_id });
  const gate = (reviews) => gateDecision({ level: "red", author: "havlinak96", headSha: "b", reviews }).pass;
  assert.equal(gate([]), false);
  assert.equal(gate([approve("b", "havlinak96")]), false);
  assert.equal(gate([approve("a")]), false);
  assert.equal(gate([approve("b")]), true);
  assert.equal(gate([approve("b"), { user: { login: "sidkvik-bit" }, state: "CHANGES_REQUESTED", commit_id: "b" }]), false);
  assert.equal(gateDecision({ level: "red", author: "sidkvik-bit", headSha: "b", reviews: [] }).pass, true);
});
