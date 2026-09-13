-- Přejmenování role "System Administrator" -> "Platform Superadmin". "System Administrator"
-- svádělo k výkladu "admin v rámci organizace"; tahle role je přitom platformová (nad VŠEMI
-- organizacemi) a uvnitř konkrétní firmy má zatím stejná práva jako Basic User.

alter table public.users drop constraint users_role_check;
-- Bez tohohle flagu by trg_user_preferences_update() (ochrana proti přímé změně role) tiše
-- vrátil starou hodnotu i u týhle migrace a následný CHECK constraint by spadl.
select set_config('app.allow_role_change', 'true', true);
update public.users set role = 'Platform Superadmin' where role = 'System Administrator';
alter table public.users alter column role set default 'Basic User';
alter table public.users add constraint users_role_check check (role in ('Basic User', 'Platform Superadmin'));

create or replace function public.is_platform_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select role = 'Platform Superadmin' from public.users where user_id = auth.uid();
$$;

-- Policy se ruší PŘED funkcí, na které závisí.
drop policy audit_logs_select_admin_only on public.audit_logs;
drop policy organizations_select_platform_admin on public.organizations;
drop function public.is_system_administrator();

create policy audit_logs_select_admin_only on public.audit_logs
  for select using (public.is_platform_superadmin());
create policy organizations_select_platform_admin on public.organizations
  for select using (public.is_platform_superadmin());

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_remaining_superadmins int;
begin
  if not public.is_platform_superadmin() then
    raise exception 'Jen Platform Superadmin smí měnit role uživatelů.';
  end if;
  if p_role not in ('Basic User', 'Platform Superadmin') then
    raise exception 'Neplatná role.';
  end if;

  if p_role = 'Basic User' then
    select count(*) into v_remaining_superadmins
      from public.users
      where role = 'Platform Superadmin' and user_id <> p_user_id;
    if v_remaining_superadmins = 0 then
      raise exception 'V celé appce musí zůstat aspoň jeden Platform Superadmin.';
    end if;
  end if;

  perform set_config('app.allow_role_change', 'true', true);
  update public.users set role = p_role where user_id = p_user_id;
end $$;

create or replace function public.admin_switch_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'Jen Platform Superadmin smí tohle udělat.';
  end if;

  perform set_config('app.allow_org_switch', 'true', true);
  update public.users set organization_id = p_organization_id where user_id = auth.uid();
end $$;
