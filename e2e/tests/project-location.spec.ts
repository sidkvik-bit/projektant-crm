import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Project's own site address (separate from the client's billing address on Account) +
 * auto-geocoded GPS. See src/lib/mapbox.ts, src/app/(app)/projects/[id]/ProjectLocationMap.tsx.
 *
 * A real NEXT_PUBLIC_MAPBOX_TOKEN is configured in this test environment, so these tests hit
 * the real Mapbox geocoding API and lock in the "token configured" behavior: the interactive
 * map renders instead of the fallback message, and saving an address really geocodes it.
 *
 * Each test creates its own throwaway project via the admin client instead of clicking the
 * first row of /projects — that row is shared/mutated by every other spec in the suite and
 * caused real flakiness here (isDirty raced with an unrelated concurrent refresh).
 */

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** The map is hidden behind a "Načíst z mapy" button so Mapbox GL doesn't load on every
 * project page visit — every test that needs the map has to reveal it first. */
/**
 * Mapbox GL při zrušení mapy, která ještě nedoběhla nahrávání, dopočítá pár svých vnitřních
 * callbacků nad už zbouranou instancí a vyhodí je do konzole. Naše komponenta uklízí správně
 * (map.remove() v cleanupu) a uživateli se nic nerozbije — je to hluk knihovny při teardownu.
 * Filtruje se proto úzce, jen tyhle dvě hlášky; cokoliv jiného test dál shodí.
 */
const MAPBOX_TEARDOWN_NOISE = [/applyProjectionUpdate/, /reading 'get'/];
const isOurError = (message: string) => !MAPBOX_TEARDOWN_NOISE.some((re) => re.test(message));

async function showMap(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Načíst z mapy" }).click();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible({ timeout: 10_000 });
}

async function createThrowawayProject(namePrefix: string) {
  const admin = adminClient();
  const { data: org, error: orgErr } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();
  if (orgErr) throw orgErr;

  const { data: contact, error: contactErr } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org.id)
    .limit(1)
    .single();
  if (contactErr) throw contactErr;

  const { data: project, error: projErr } = await admin
    .from("projects")
    .insert({ organization_id: org.id, primary_contact_id: contact.id, name: `${namePrefix} ${Date.now()}` })
    .select("id")
    .single();
  if (projErr) throw projErr;

  return { admin, projectId: project.id as string };
}

test("the map is hidden behind a button by default, and loads only once requested", async ({ page }) => {
  const { admin, projectId } = await createThrowawayProject("E2E Location Map");

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`/projects/${projectId}`);

  await expect(page.getByRole("button", { name: "Načíst z mapy" })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toHaveCount(0);

  await showMap(page);
  await expect(page.getByText(/Mapa vyžaduje Mapbox token/)).toHaveCount(0);

  // collapsing and re-showing must not error either (mount/unmount of the Mapbox instance)
  await page.getByRole("button", { name: "Skrýt mapu" }).click();
  await expect(page.locator(".mapboxgl-canvas")).toHaveCount(0);
  await showMap(page);

  const ourErrors = errors.filter(isOurError);
  expect(ourErrors, `errors on project detail page:\n${ourErrors.join("\n")}`).toEqual([]);

  await admin.from("projects").delete().eq("id", projectId);
});

test("saving a project address geocodes it via the real Mapbox API and stores GPS", async ({ page }) => {
  const { admin, projectId } = await createThrowawayProject("E2E Location Save");

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`/projects/${projectId}`);

  await page.getByLabel(/^Ulice/i).fill("Maříkova");
  await page.getByLabel(/Číslo popisné/i).fill("2287/1a");
  await page.getByRole("textbox", { name: "Obec" }).fill("Brno");
  await page.getByLabel(/^PSČ/i).fill("62100");
  await page.getByLabel(/^Stát/i).fill("Česká republika");
  await page.getByLabel(/Katastrální území/i).fill("Řečkovice");
  await page.getByLabel(/Parcelní číslo/i).fill("123/4");

  await page.getByRole("button", { name: /^Uložit změny/ }).first().click();
  await expect(page.getByRole("button", { name: "Zavřít" })).toBeVisible({ timeout: 10_000 });

  expect(errors, `errors saving a project address with a Mapbox token:\n${errors.join("\n")}`).toEqual([]);

  // real geocoding result — loosely bounded to Brno's area rather than an exact point,
  // since Mapbox's precise match can shift slightly between requests.
  await expect(async () => {
    const { data: saved } = await admin
      .from("projects")
      .select("address_city, gps_lat, gps_lng")
      .eq("id", projectId)
      .single();
    expect(saved?.address_city).toBe("Brno");
    expect(saved?.gps_lat).toBeGreaterThan(48.9);
    expect(saved?.gps_lat).toBeLessThan(49.4);
    expect(saved?.gps_lng).toBeGreaterThan(16.3);
    expect(saved?.gps_lng).toBeLessThan(16.9);
  }).toPass({ timeout: 10_000 });

  await admin.from("projects").delete().eq("id", projectId);
});

test("searching a place, picking a suggestion, and overwriting the address updates Místo realizace live", async ({
  page,
}) => {
  const { admin, projectId } = await createThrowawayProject("E2E Location Search");

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`/projects/${projectId}`);
  await showMap(page);

  // Obec starts empty on a fresh project — the assertion after "Přepsat adresu" below only
  // means something if this really changes from "empty" to "populated by the map".
  const cityInput = page.getByRole("textbox", { name: "Obec" });
  await expect(cityInput).toHaveValue("");

  await page.getByPlaceholder(/Hledat místo/i).fill("Brno, Česko");
  const suggestion = page.getByRole("option").first();
  await expect(suggestion).toBeVisible({ timeout: 10_000 });
  await suggestion.click();

  // picking a suggestion drops a pending pin — the two map actions appear
  await expect(page.getByRole("button", { name: "Přepsat adresu" })).toBeVisible();
  await page.getByRole("button", { name: "Přepsat adresu" }).click();
  await expect(page.getByRole("dialog", { name: "Přepsat adresu projektu?" })).toBeVisible();
  await page.getByRole("button", { name: "Ano, přepsat adresu" }).click();

  // FormEngine only reads defaultValues once on mount — after router.refresh() following this
  // save, the Místo realizace section must re-sync from the fresh server data on its own,
  // with no manual page reload (this is the exact bug the user reported: this field used to
  // just sit stale until you refreshed by hand).
  await expect(cityInput).not.toHaveValue("", { timeout: 10_000 });
  await expect(cityInput).toHaveValue(/Brno/i);

  expect(errors, `errors searching/overwriting address:\n${errors.join("\n")}`).toEqual([]);

  await admin.from("projects").delete().eq("id", projectId);
});

test("Přepsat GPS asks for confirmation and stores the picked point independently of the address", async ({
  page,
}) => {
  const { admin, projectId } = await createThrowawayProject("E2E Location Set GPS");

  await page.goto(`/projects/${projectId}`);
  await showMap(page);
  await expect(page.getByText("Uložené GPS: zatím není nastaveno")).toBeVisible();

  await page.getByPlaceholder(/Hledat místo/i).fill("Brno, Česko");
  const suggestion = page.getByRole("option").first();
  await expect(suggestion).toBeVisible({ timeout: 10_000 });
  await suggestion.click();

  // cancelling must not save anything
  await page.getByRole("button", { name: "Přepsat GPS" }).click();
  await expect(page.getByRole("dialog", { name: "Přepsat GPS projektu?" })).toBeVisible();
  await page.getByRole("button", { name: "Zrušit" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Uložené GPS: zatím není nastaveno")).toBeVisible();

  await page.getByRole("button", { name: "Přepsat GPS" }).click();
  await page.getByRole("button", { name: "Ano, přepsat GPS" }).click();
  await expect(page.getByText(/^Uložené GPS: \d/)).toBeVisible({ timeout: 10_000 });

  const { data: saved } = await admin.from("projects").select("gps_lat, gps_lng, address_city").eq("id", projectId).single();
  expect(saved?.gps_lat).not.toBeNull();
  // "Přepsat GPS" must never touch the address fields — it's a separate, independent action.
  expect(saved?.address_city).toBeNull();

  await admin.from("projects").delete().eq("id", projectId);
});

test("map style switcher changes the base map without errors", async ({ page }) => {
  const { admin, projectId } = await createThrowawayProject("E2E Location Style");

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`/projects/${projectId}`);
  await showMap(page);

  await page.getByRole("combobox").filter({ hasText: "Ulice" }).click();
  await page.getByRole("option", { name: "Satelit" }).click();
  await expect(page.getByRole("combobox").filter({ hasText: "Satelit" })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();

  expect(errors, `errors switching map style:\n${errors.join("\n")}`).toEqual([]);

  await admin.from("projects").delete().eq("id", projectId);
});
