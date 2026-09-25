import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Tým projektu (project_contacts).
 *
 * Existuje proto, že dřív se tým odvozoval z kontaktů klientovy firmy — takže statika ani geodeta,
 * kteří pracují jinde, nešlo k projektu přiřadit vůbec. Test tu vazbu ověřuje právě na člověku
 * z úplně jiné firmy než klient.
 */
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

test("a person from a different company can be put on the project team, with a role", async ({ page }) => {
  const admin = adminClient();
  const suffix = Date.now();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();

  // Klient a specialista schválně pod jinými firmami — přesně ten případ, co dřív nešel.
  const { data: clientCompany } = await admin
    .from("accounts")
    .insert({ organization_id: org!.id, name: `E2E Tým Klient s.r.o. ${suffix}` })
    .select("id")
    .single();
  const { data: otherCompany } = await admin
    .from("accounts")
    .insert({ organization_id: org!.id, name: `E2E Tým Statika a.s. ${suffix}` })
    .select("id")
    .single();
  const { data: client } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, account_id: clientCompany!.id, first_name: "Klient", last_name: `Tým ${suffix}` })
    .select("id")
    .single();
  const specialistName = `Statik Tým ${suffix}`;
  const { data: specialist } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, account_id: otherCompany!.id, first_name: "Statik", last_name: `Tým ${suffix}` })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org!.id, primary_contact_id: client!.id, name: `E2E Tým Projekt ${suffix}` })
    .select("id")
    .single();

  try {
    await page.goto(`/projects/${project!.id}`);
    await page.getByRole("tab", { name: /Tým/i }).click();
    await expect(page.getByText(/K projektu zatím nikdo není přiřazený/)).toBeVisible();

    await page.getByLabel("Kontakt").click();
    await page.getByRole("option", { name: specialistName }).click();
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Statik", exact: true }).click();
    await page.getByRole("button", { name: "Přidat" }).click();

    const teamRow = page.locator("div.rounded-lg.border", { hasText: specialistName });
    await expect(teamRow.getByRole("link", { name: specialistName })).toBeVisible();
    await expect(teamRow.getByText("Statik", { exact: true })).toBeVisible();

    const { data: rows } = await admin
      .from("project_contacts")
      .select("contact_id, role:option_set_values!project_contacts_role_id_fkey(label)")
      .eq("project_id", project!.id);
    expect(rows).toHaveLength(1);
    expect(rows![0].contact_id).toBe(specialist!.id);
    expect((rows![0] as unknown as { role: { label: string } }).role.label).toBe("Statik");

    // Odebrání se potvrzuje dialogem — standard projektu u mazacích akcí.
    await page.getByTitle("Odebrat z týmu").click();
    await page.getByRole("button", { name: "Ano, odebrat" }).click();
    await expect(page.getByText(/K projektu zatím nikdo není přiřazený/)).toBeVisible();

    // Kontakt sám musí zůstat — odebírá se jen vazba.
    const { data: stillThere } = await admin.from("contacts").select("id").eq("id", specialist!.id).maybeSingle();
    expect(stillThere).not.toBeNull();
  } finally {
    await admin.from("project_contacts").delete().eq("project_id", project!.id);
    await admin.from("projects").delete().eq("id", project!.id);
    await admin.from("contacts").delete().in("id", [client!.id, specialist!.id]);
    await admin.from("accounts").delete().in("id", [clientCompany!.id, otherCompany!.id]);
  }
});

test("a contact used as a project client cannot be deleted", async () => {
  const admin = adminClient();
  const suffix = Date.now();
  const { data: org } = await admin.from("organizations").select("id").eq("name", "E2E Test Org").single();

  const { data: contact } = await admin
    .from("contacts")
    .insert({ organization_id: org!.id, first_name: "Nesmazatelný", last_name: `Klient ${suffix}` })
    .select("id")
    .single();
  const { data: project } = await admin
    .from("projects")
    .insert({ organization_id: org!.id, primary_contact_id: contact!.id, name: `E2E Restrict Projekt ${suffix}` })
    .select("id")
    .single();

  try {
    // Kontakt je jediná vazba na zákazníka, takže jeho smazání by fakturu připravilo o odběratele.
    // Proto restrict, ne set null.
    const { error } = await admin.from("contacts").delete().eq("id", contact!.id);
    expect(error, "mazání kontaktu s projektem musí selhat").not.toBeNull();

    const { data: stillThere } = await admin.from("contacts").select("id").eq("id", contact!.id).maybeSingle();
    expect(stillThere).not.toBeNull();
  } finally {
    await admin.from("projects").delete().eq("id", project!.id);
    await admin.from("contacts").delete().eq("id", contact!.id);
  }
});
