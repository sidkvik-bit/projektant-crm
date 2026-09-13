-- "Přepnout firmu" v Nastavení: existující uživatel může přejít do jiné organizace, ke které
-- má pozvánku (organization_invites, RLS scoped na jeho vlastní ověřený e-mail — viz
-- organization_invites_select_own_email), nebo si rovnou založit úplně novou. Nahrazuje jeho
-- CELÉ dosavadní organization_id, nepřidává druhé členství vedle prvního (jednoduchý switch,
-- ne trvalé členství ve víc firmách zároveň — viz rozhodnutí v konverzaci).
--
-- users.organization_id je jinak chráněný triggerem (trg_user_preferences_update z
-- 20260830095332_init_core_schema.sql vždycky resetuje new.organization_id :=
-- old.organization_id) — normální UPDATE z klienta ho tedy nikdy nezmění, ani přes RLS.
-- Obě funkce níž ho obchází přes transakčně-lokální GUC flag, co trigger explicitně
-- kontroluje — jediná legitimní cesta, jak se organization_id smí změnit.

create or replace function public.trg_user_preferences_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  if current_setting('app.allow_org_switch', true) is distinct from 'true' then
    new.organization_id := old.organization_id;
  end if;
  return new;
end $$;

create or replace function public.switch_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite_id uuid;
  v_email text := lower(auth.jwt() ->> 'email');
begin
  select id into v_invite_id
  from public.organization_invites
  where organization_id = p_organization_id and email = v_email;

  if v_invite_id is null then
    raise exception 'Pozvánka k této organizaci nebyla nalezena.';
  end if;

  perform set_config('app.allow_org_switch', 'true', true);
  update public.users set organization_id = p_organization_id where user_id = auth.uid();

  delete from public.organization_invites where id = v_invite_id;
end $$;

grant execute on function public.switch_organization(uuid) to authenticated;

-- Založit si rovnou novou firmu (druhá volba na téže obrazovce, stejná jako při onboardingu) —
-- žádná pozvánka není potřeba, jen bezpečné vytvoření nové organizace + přepnutí v jedné transakci.
create or replace function public.create_and_switch_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
begin
  insert into public.organizations (name) values (p_name) returning id into v_org_id;

  perform set_config('app.allow_org_switch', 'true', true);
  update public.users set organization_id = v_org_id where user_id = auth.uid();

  return v_org_id;
end $$;

grant execute on function public.create_and_switch_organization(text) to authenticated;
