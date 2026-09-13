-- Oprava rozsahu role: System Administrator je platformová role (superadmin nad CELOU appkou,
-- napříč všemi organizacemi), ne role omezená na jednu organizaci — viz diskuze v konverzaci,
-- co následovala po 20260913260000_add_user_roles.sql. V rámci VLASTNÍ organizace má System
-- Administrator zatím stejná práva jako Basic User (žádné zvláštní CRUD pravomoci nad běžnými
-- daty) — jediné, co role navíc dává, je přístup do /admin sekce s přehledem a přepínáním
-- napříč VŠEMI organizacemi. Přejmenováno z is_org_admin() na is_system_administrator(), ať
-- název neklame budoucího čtenáře (funkce nikdy organizaci nekontrolovala, jen se tak jmenovala).

create or replace function public.is_system_administrator()
returns boolean language sql stable security definer set search_path = public as $$
  select role = 'System Administrator' from public.users where user_id = auth.uid();
$$;

-- Audit log: System Administrator vidí VŠECHNY organizace, ne jen svoji vlastní (je to
-- podpůrný/kontrolní nástroj nad celou appkou). Basic User nevidí žádný — ani vlastní
-- organizace — audit log je čistě admin nástroj, ne běžná firemní funkce.
-- Policy se ruší PŘED funkcí, na které závisí (jinak DROP FUNCTION selže na závislosti).
drop policy audit_logs_select_admin_only on public.audit_logs;
drop function public.is_org_admin();
create policy audit_logs_select_admin_only on public.audit_logs
  for select using (public.is_system_administrator());

-- set_user_role: dřív šlo měnit roli jen lidem ve VLASTNÍ organizaci volajícího — teď je to
-- platformová role, takže System Administrator smí měnit roli komukoliv v libovolné
-- organizaci. "Poslední admin" pojistka je teď globální (napříč celou appkou), ne per-org.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_remaining_admins int;
begin
  if not public.is_system_administrator() then
    raise exception 'Jen System Administrator smí měnit role uživatelů.';
  end if;
  if p_role not in ('Basic User', 'System Administrator') then
    raise exception 'Neplatná role.';
  end if;

  if p_role = 'Basic User' then
    select count(*) into v_remaining_admins
      from public.users
      where role = 'System Administrator' and user_id <> p_user_id;
    if v_remaining_admins = 0 then
      raise exception 'V celé appce musí zůstat aspoň jeden System Administrator.';
    end if;
  end if;

  perform set_config('app.allow_role_change', 'true', true);
  update public.users set role = p_role where user_id = p_user_id;
end $$;

-- System Administrator vidí a spravuje VŠECHNY organizace (ne přes pozvánku, jako
-- switch_organization() v 20260913240000_add_organization_switching.sql).
create policy organizations_select_platform_admin on public.organizations
  for select using (public.is_system_administrator());

create or replace function public.admin_switch_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_administrator() then
    raise exception 'Jen System Administrator smí tohle udělat.';
  end if;

  perform set_config('app.allow_org_switch', 'true', true);
  update public.users set organization_id = p_organization_id where user_id = auth.uid();
end $$;

grant execute on function public.admin_switch_organization(uuid) to authenticated;
