-- Basic User / System Administrator role na uživateli — dosud jediné "oprávnění" v appce bylo
-- "jsi/nejsi členem organizace", takže i citlivé akce (pozvat/odebrat člena týmu, číst kompletní
-- audit log) mohl dělat kdokoliv v organizaci. Přidává skutečnou roli.

alter table public.users
  add column role text not null default 'Basic User' check (role in ('Basic User', 'System Administrator'));

-- Explicitně určený první admin (podle e-mailu, ne podle interního user_id).
update public.users set role = 'System Administrator' where email = 'sidkvik@gmail.com';

-- role je stejně citlivé pole jako organization_id (viz 20260913240000_add_organization_
-- switching.sql) — normální UPDATE ho nesmí měnit, jen přes set_user_role() níž. Bezpečnostní
-- kontrola je v proceduře, ne v RLS, protože RLS umí povolit/zakázat celý řádek, ne "smíš měnit
-- tenhle sloupec, ale ne tamten".
create or replace function public.trg_user_preferences_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  if current_setting('app.allow_org_switch', true) is distinct from 'true' then
    new.organization_id := old.organization_id;
  end if;
  if current_setting('app.allow_role_change', true) is distinct from 'true' then
    new.role := old.role;
  end if;
  return new;
end $$;

create or replace function public.is_org_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select role = 'System Administrator' from public.users where user_id = auth.uid();
$$;

-- Mění roli JEN v rámci vlastní organizace volajícího (per-org administrace — ne napříč
-- organizacemi, to zůstává samostatný, zatím neřešený "platform admin" koncept). Nedovolí
-- odebrat poslední System Administrator organizace, ať se nikdo sám nezamkne ven.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_org uuid;
  v_target_org uuid;
  v_remaining_admins int;
begin
  if not public.is_org_admin() then
    raise exception 'Jen System Administrator smí měnit role uživatelů.';
  end if;
  if p_role not in ('Basic User', 'System Administrator') then
    raise exception 'Neplatná role.';
  end if;

  select organization_id into v_caller_org from public.users where user_id = auth.uid();
  select organization_id into v_target_org from public.users where user_id = p_user_id;
  if v_target_org is null or v_target_org is distinct from v_caller_org then
    raise exception 'Uživatel nepatří do tvojí organizace.';
  end if;

  if p_role = 'Basic User' then
    select count(*) into v_remaining_admins
      from public.users
      where organization_id = v_caller_org and role = 'System Administrator' and user_id <> p_user_id;
    if v_remaining_admins = 0 then
      raise exception 'Organizace musí mít aspoň jednoho System Administrator.';
    end if;
  end if;

  perform set_config('app.allow_role_change', 'true', true);
  update public.users set role = p_role where user_id = p_user_id;
end $$;

grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Audit log dřív mohl číst kdokoliv v organizaci (žádné role ještě neexistovaly) — obsahuje
-- kompletní staré/nové hodnoty každé změny včetně cizích záznamů, takže je citlivější než
-- běžná data. Teď jen System Administrator.
drop policy audit_logs_select_own_org on public.audit_logs;
create policy audit_logs_select_admin_only on public.audit_logs
  for select using (organization_id = public.get_my_organization_id() and public.is_org_admin());
