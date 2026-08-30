import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("cron generates a PUSH notification for an overdue milestone, and it shows up in the bell", async ({
  page,
  baseURL,
  request,
}) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) test.skip(true, "CRON_SECRET not set in environment");

  // The cron dedupes by (user, milestone, day) so re-running this test on the same
  // day would otherwise see pushCreated=0 — clear yesterday's run first.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  await admin.from("notifications").delete().ilike("message", "%DSP (test — po termínu)%");

  const res = await request.get(`${baseURL}/api/cron/daily-digest`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.pushCreated, JSON.stringify(body)).toBeGreaterThan(0);

  await page.goto("/dashboard");
  await page.locator("header button").first().click();
  const item = page.getByText(/DSP \(test — po termínu\)/);
  await expect(item).toBeVisible();

  // Unread items render the message with font-medium; read ones fall back to
  // text-muted-foreground (see TopBar.tsx). Confirm it starts unread, then mark it read.
  await expect(item).toHaveClass(/font-medium/);
  await item.click(); // selecting a menu item closes the popup

  await page.locator("header button").first().click();
  await expect(item).toHaveClass(/text-muted-foreground/);
});
