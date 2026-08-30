import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { TEST_EMAIL, TEST_PASSWORD, TEST_ORG_NAME, buildAuthCookie } from "./lib/testAuth";

// Testovací účet je vytvořen přímo přes Supabase Admin API a session je vložena
// jako cookie stejného formátu, jaký píše @supabase/ssr — obchází se tak Google
// OAuth (nejde automatizovat), aniž by šlo o hack mimo standardní auth flow.

async function ensureOrganization(admin: ReturnType<typeof createClient>) {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("name", TEST_ORG_NAME)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await admin
    .from("organizations")
    .insert({ name: TEST_ORG_NAME })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function ensureAuthUser(admin: ReturnType<typeof createClient>) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Tester" },
  });
  if (!createError) return created.user;

  // Uživatel z minulého běhu už existuje — dohledej ho.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === TEST_EMAIL);
    if (found) return found;
    if (data.users.length < 200) break;
    page += 1;
  }
  throw new Error(`Nepodařilo se najít ani vytvořit testovacího uživatele: ${createError.message}`);
}

async function ensureUserRow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string,
) {
  await admin.from("users").upsert(
    {
      user_id: userId,
      organization_id: organizationId,
      email: TEST_EMAIL,
      first_name: "E2E",
      last_name: "Tester",
    },
    { onConflict: "user_id" },
  );
}

async function seedBusinessData(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
) {
  const { count: accountCount } = await admin
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if ((accountCount ?? 0) > 0) return; // už naseedováno z předchozího běhu

  const common = { organization_id: organizationId, owner_id: userId, created_by: userId };

  const { data: accounts, error: accErr } = await admin
    .from("accounts")
    .insert([
      { ...common, name: "Novák Architekti s.r.o.", ico: "12345678", email: "info@novak-architekti.cz" },
      { ...common, name: "Stavební huť Praha a.s.", ico: "87654321", email: "kontakt@stavebnihut.cz" },
    ])
    .select("id, name");
  if (accErr) throw accErr;
  const [accountA, accountB] = accounts;

  const { error: contactErr } = await admin.from("contacts").insert([
    { ...common, account_id: accountA.id, first_name: "Jana", last_name: "Nováková", email: "jana@novak-architekti.cz" },
    { ...common, account_id: accountB.id, first_name: "Petr", last_name: "Svoboda", email: "petr@stavebnihut.cz" },
    // schválně BEZ account_id — ověřuje se, že kontakt může existovat bez firmy
    { ...common, first_name: "Eva", last_name: "Volná", email: "eva.volna@example.com" },
  ]);
  if (contactErr) throw contactErr;

  const { error: leadErr } = await admin.from("leads").insert([
    { ...common, name: "Poptávka RD Průhonice", company_name: "Rodinný dům s.r.o.", expected_value: 450000 },
    { ...common, name: "Rekonstrukce kanceláří", company_name: "OfficeSpace a.s.", expected_value: 890000 },
  ]);
  if (leadErr) throw leadErr;

  const { data: template, error: templateErr } = await admin
    .from("project_templates")
    .insert({ ...common, name: "Standardní projekt RD" })
    .select("id")
    .single();
  if (templateErr) throw templateErr;

  await admin.from("template_milestones").insert([
    { organization_id: organizationId, template_id: template.id, name: "Studie", offset_dni: 14 },
    { organization_id: organizationId, template_id: template.id, name: "DSP", offset_dni: 60 },
  ]);

  const { data: project, error: projectErr } = await admin
    .from("projects")
    .insert({
      ...common,
      account_id: accountA.id,
      project_template_id: template.id,
      name: "Rodinný dům Nováková",
      deadline: "2026-12-31",
      budget: 620000,
    })
    .select("id")
    .single();
  if (projectErr) throw projectErr;

  const { data: milestone, error: msErr } = await admin
    .from("project_milestones")
    .insert({
      organization_id: organizationId,
      project_id: project.id,
      name: "Studie",
      termin_splneni: "2026-09-15",
    })
    .select("id")
    .single();
  if (msErr) throw msErr;

  await admin.from("activities").insert([
    {
      ...common,
      entity_type: "Project",
      entity_id: project.id,
      subject: "Úvodní schůzka s klientem",
      activity_date: new Date().toISOString(),
    },
  ]);

  // PUSH notifikace na milník výše (v budoucnu — nemá se ještě spustit).
  await admin.from("notifications_config").insert({
    organization_id: organizationId,
    milestone_id: milestone.id,
    recipient_user_id: userId,
    type: "PUSH",
    dni_predem: 3,
  });

  // Druhý, už PO TERMÍNU milník s PUSH konfigurací — cron by na něj měl
  // vygenerovat zvoneček (viz e2e/tests/notifications.spec.ts).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: overdueMilestone, error: overdueMsErr } = await admin
    .from("project_milestones")
    .insert({
      organization_id: organizationId,
      project_id: project.id,
      name: "DSP (test — po termínu)",
      termin_splneni: yesterday,
    })
    .select("id")
    .single();
  if (overdueMsErr) throw overdueMsErr;

  await admin.from("notifications_config").insert({
    organization_id: organizationId,
    milestone_id: overdueMilestone.id,
    recipient_user_id: userId,
    type: "PUSH",
    dni_predem: 3,
  });
}

async function buildStorageState(anonUrl: string, anonKey: string, email: string, password: string) {
  const anon = createClient(anonUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("Přihlášení testovacího uživatele selhalo");

  const cookie = buildAuthCookie(anonUrl, data.session);

  return {
    cookies: [
      {
        name: cookie.name,
        value: cookie.value,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Chybí NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY v prostředí.",
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const organizationId = await ensureOrganization(admin);
  const user = await ensureAuthUser(admin);
  await ensureUserRow(admin, user.id, organizationId);
  await seedBusinessData(admin, organizationId, user.id);

  const storageState = await buildStorageState(url, anonKey, TEST_EMAIL, TEST_PASSWORD);
  const authDir = path.join(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(path.join(authDir, "user.json"), JSON.stringify(storageState, null, 2));

  console.log(`[e2e/global-setup] test org=${organizationId} user=${user.id} — session ready.`);
}
