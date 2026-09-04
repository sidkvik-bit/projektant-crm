-- Root Drive složka organizace (admin nastavení) — pod ní se zakládají per-projekt
-- podsložky. Jen odkaz/ID, žádný token — ty zůstávají v google_drive_tokens.
alter table public.organizations
  add column drive_root_folder_url text;
