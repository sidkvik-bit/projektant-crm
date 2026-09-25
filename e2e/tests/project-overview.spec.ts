import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * /project-overview — org-wide (not just "my milestones", unlike /dashboard) view of project
 * stages, overdue/upcoming milestones, and projects with no logged Activity in 14+ days.
 * Doesn't assert exact counts/stage breakdown — the shared E2E test org accumulates a lot of
 * leftover projects from other specs, so only presence of this test's own known records is checked.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("shows an overdue milestone, an upcoming milestone, and a stalled project, each linking to its project", async ({ page }) => {
  const admin = adminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (!org) throw new Error("E2E Test Org not found");
  const { data: contact } = await admin.from("contacts").select("id").eq("organization_id", org.id).limit(1).single();

  const suffix = Date.now();

  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org.id, primary_contact_id: contact!.id, name: `E2E Overview Project ${suffix}` })
    .select("id")
    .single();

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await admin.from("project_milestones").insert([
    { organization_id: org.id, project_id: project!.id, name: `E2E Overdue Milestone ${suffix}`, termin_splneni: yesterday },
    { organization_id: org.id, project_id: project!.id, name: `E2E Upcoming Milestone ${suffix}`, termin_splneni: in3Days },
  ]);

  // created_at/updated_at are trigger-protected (always forced to now() on insert, immutable
  // after — see trg_set_insert_system_fields), so a "stalled" project can't be simulated by
  // backdating the project row itself. activity_date is a plain business field though — an old
  // one here makes lastActivityByProject resolve to it (taking priority over created_at).
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("activities").insert({
    organization_id: org.id,
    entity_type: "Project",
    entity_id: project!.id,
    subject: `E2E Old Activity ${suffix}`,
    activity_date: twentyDaysAgo,
  });

  try {
    await page.goto("/project-overview");
    await expect(page.getByRole("heading", { name: "Přehled projektů" })).toBeVisible();

    const overdueCard = page.getByText(`E2E Overdue Milestone ${suffix}`);
    await expect(overdueCard).toBeVisible();
    const upcomingCard = page.getByText(`E2E Upcoming Milestone ${suffix}`);
    await expect(upcomingCard).toBeVisible();

    // Its only Activity is 20 days old (past the 14-day stalled cutoff) — must show up in
    // "Bez pohybu". (Milestone-card links also mention the project name as their subtitle, so
    // scope by BOTH the project name and the "Naposledy aktivní" copy to isolate this one card.)
    const stalledCard = page
      .getByRole("link")
      .filter({ hasText: `E2E Overview Project ${suffix}` })
      .filter({ hasText: "Naposledy aktivní" });
    await expect(stalledCard).toBeVisible();

    await stalledCard.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project!.id}`));
  } finally {
    await admin.from("activities").delete().eq("entity_id", project!.id);
    await admin.from("project_milestones").delete().eq("project_id", project!.id);
    await admin.from("projects").delete().eq("id", project!.id);
  }
});
