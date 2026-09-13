-- Zjištěno při stavbě admin sekce: users select policy (dosud pojmenovaná po staré tabulce
-- user_preferences) pouštěla jen VLASTNÍ řádek (user_id = auth.uid()) — žádná policy nikdy
-- nedovolovala vidět OSTATNÍ členy vlastní organizace. To tiše lámalo getOrgUserOptions()
-- (používá RLS-scoped klienta, ne admin) — "Vlastník" picker na formulářích tedy reálně
-- nabízel jen přihlášeného uživatele, nikdy zbytek týmu. Nová policy je nadmnožina té staré
-- (vlastní řádek je vždycky součástí vlastní organizace), takže se stará policy ruší.

drop policy user_preferences_select_own on public.users;
create policy users_select_same_org on public.users
  for select using (organization_id = public.get_my_organization_id());
