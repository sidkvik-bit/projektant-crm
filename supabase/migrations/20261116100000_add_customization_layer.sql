-- Vrstva úprav firmy (customization layer) — firmy si nad základním řešením (JSON metadata v
-- src/solutions/Projektant_CRM) skládají vlastní pole, entity, formuláře, pohledy, tlačítka,
-- skripty a pluginy. Funguje jako větev nad repem: každá komponenta má rozpracovanou verzi
-- (draft) a publikovanou verzi; publikování je atomické, zapíše se do historie s předchozím
-- stavem a jde vrátit. Návod pro uživatele: docs/upravy-firmy/.
--
-- Proč tahle podoba:
-- * Vlastní pole se ukládají do sloupce `custom` (jsonb) na každé obchodní tabulce, ne jako nové
--   sloupce — firma nesmí měnit schéma sdílené databáze (DDL), a jsonb jde filtrovat i řadit
--   přes PostgREST (custom->>new_x). Klíče jsou celé názvy polí včetně prefixu `new_` (D365 vzor).
-- * Vlastní entity mají jednu společnou tabulku custom_records (rozlišené entity_name), se
--   stejným tenant zapojením jako ostatní tabulky (RLS, systémová pole, audit, vlastník).
-- * Upravovat smí jen role System Customizer (nová, v rámci své firmy) a Platform Superadmin.
--   Číst publikované úpravy musí každý člen firmy — podle nich se mu vykresluje appka.

-- ----------------------------------------------------------------------------
-- 1) Role System Customizer
-- ----------------------------------------------------------------------------

alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('Basic User', 'System Customizer', 'Platform Superadmin'));

create or replace function public.is_org_customizer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('System Customizer', 'Platform Superadmin') from public.users where user_id = auth.uid()), false);
$$;
grant execute on function public.is_org_customizer() to authenticated;

-- Celé tělo z 20260913263000. Nově zná roli System Customizer a pojistku "aspoň jeden
-- Platform Superadmin" hlídá při změně na jakoukoli jinou roli (dřív jen na Basic User).
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_remaining_superadmins int;
begin
  if not public.is_platform_superadmin() then
    raise exception 'Jen Platform Superadmin smí měnit role uživatelů.';
  end if;
  if p_role not in ('Basic User', 'System Customizer', 'Platform Superadmin') then
    raise exception 'Neplatná role.';
  end if;

  if p_role <> 'Platform Superadmin' then
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

-- První customizer: Jan Havlín (firma VHarch) — vlastník zadání, pro kterého vrstva vzniká.
select set_config('app.allow_role_change', 'true', true);
update public.users set role = 'System Customizer'
  where email = 'pro.havlin@gmail.com' and role = 'Basic User';
select set_config('app.allow_role_change', 'false', true);

-- ----------------------------------------------------------------------------
-- 2) Komponenty vrstvy úprav
-- ----------------------------------------------------------------------------

create table public.customization_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  component_type text not null
    check (component_type in ('entity', 'field', 'form', 'view', 'command', 'script', 'plugin')),
  -- Logický název entity, ke které komponenta patří ("Project", vlastní "new_Zakazka"…);
  -- u komponenty typu 'entity' je to její vlastní název, u sdílených skriptů '*'.
  entity_name text not null,
  key text not null,
  -- Publikovaná definice (null = ještě nikdy nepublikováno) a rozpracovaná (null = beze změn).
  published jsonb,
  draft jsonb,
  -- Rozpracované smazání — komponenta zmizí až publikováním.
  draft_deleted boolean not null default false,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (organization_id, component_type, entity_name, key),
  check (key ~ '^[A-Za-z0-9_]{1,64}$'),
  check (entity_name ~ '^([A-Za-z0-9_]{1,64}|\*)$')
);

create index customization_components_organization_id_idx on public.customization_components(organization_id);

create trigger customization_components_before_insert before insert on public.customization_components
  for each row execute function public.trg_set_insert_system_fields();
create trigger customization_components_before_update before update on public.customization_components
  for each row execute function public.trg_set_update_system_fields();
create trigger customization_components_audit after insert or update or delete on public.customization_components
  for each row execute function public.trg_audit_log();

alter table public.customization_components enable row level security;
create policy customization_components_select on public.customization_components
  for select using (organization_id = public.get_my_organization_id());
create policy customization_components_insert on public.customization_components
  for insert with check (organization_id = public.get_my_organization_id() and public.is_org_customizer());
create policy customization_components_update on public.customization_components
  for update using (organization_id = public.get_my_organization_id() and public.is_org_customizer())
  with check (organization_id = public.get_my_organization_id() and public.is_org_customizer());
create policy customization_components_delete on public.customization_components
  for delete using (organization_id = public.get_my_organization_id() and public.is_org_customizer());

-- Historie publikací — neměnná (žádná update/delete policy). `changes` je pole
-- {component_type, entity_name, key, before, after}; before/after null = vznik/smazání.
create table public.customization_publishes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number int not null,
  message text not null default '',
  changes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (organization_id, number)
);

create index customization_publishes_organization_id_idx on public.customization_publishes(organization_id);

create trigger customization_publishes_before_insert before insert on public.customization_publishes
  for each row execute function public.trg_set_insert_system_fields();

alter table public.customization_publishes enable row level security;
create policy customization_publishes_select on public.customization_publishes
  for select using (organization_id = public.get_my_organization_id());
create policy customization_publishes_insert on public.customization_publishes
  for insert with check (organization_id = public.get_my_organization_id() and public.is_org_customizer());

-- Trace log skriptů a pluginů (console.log, chyby) — D365 "Plugin Trace Log". Zapisuje ho
-- kterýkoli člen firmy (pluginy běží pod tím, kdo akci spustil), číst ho smí customizer.
create table public.customization_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  component_type text not null check (component_type in ('script', 'plugin')),
  entity_name text not null check (char_length(entity_name) <= 64),
  key text not null check (char_length(key) <= 64),
  event text not null check (char_length(event) <= 64),
  level text not null check (level in ('log', 'error')),
  message text not null check (char_length(message) <= 4000),
  duration_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index customization_logs_org_created_idx on public.customization_logs(organization_id, created_at desc);

create trigger customization_logs_before_insert before insert on public.customization_logs
  for each row execute function public.trg_set_insert_system_fields();

alter table public.customization_logs enable row level security;
create policy customization_logs_select on public.customization_logs
  for select using (organization_id = public.get_my_organization_id() and public.is_org_customizer());
create policy customization_logs_insert on public.customization_logs
  for insert with check (organization_id = public.get_my_organization_id());

-- ----------------------------------------------------------------------------
-- 3) Publikování a vrácení — security invoker: běží pod RLS volajícího, takže je smí
--    spustit jen customizer a jen nad vlastní firmou. Jedna transakce = všechno, nebo nic.
-- ----------------------------------------------------------------------------

create or replace function public.publish_customizations(p_message text)
returns int language plpgsql set search_path = public as $$
declare
  v_org uuid := public.get_my_organization_id();
  v_changes jsonb;
  v_number int;
begin
  if not public.is_org_customizer() then
    raise exception 'Publikovat smí jen System Customizer.';
  end if;
  -- Dvě souběžná publikování téže firmy by si přidělila stejné číslo — druhé počká.
  perform pg_advisory_xact_lock(hashtext('publish_customizations:' || v_org::text));

  -- Komponenta založená a smazaná v témže draftu se nikdy nepublikovala — jen ji uklidit.
  delete from public.customization_components
    where organization_id = v_org and draft_deleted and published is null;

  select coalesce(jsonb_agg(jsonb_build_object(
      'component_type', component_type,
      'entity_name', entity_name,
      'key', key,
      'before', published,
      'after', case when draft_deleted then null else draft end
    ) order by component_type, entity_name, key), '[]'::jsonb)
    into v_changes
    from public.customization_components
    where organization_id = v_org and (draft is not null or draft_deleted);

  if jsonb_array_length(v_changes) = 0 then
    raise exception 'Není co publikovat.';
  end if;

  select coalesce(max(number), 0) + 1 into v_number
    from public.customization_publishes where organization_id = v_org;
  insert into public.customization_publishes (organization_id, number, message, changes)
    values (v_org, v_number, coalesce(p_message, ''), v_changes);

  delete from public.customization_components
    where organization_id = v_org and draft_deleted;
  update public.customization_components
    set published = draft, draft = null, published_at = now(), published_by = auth.uid()
    where organization_id = v_org and draft is not null;

  return v_number;
end $$;
grant execute on function public.publish_customizations(text) to authenticated;

-- Připraví vrácení publikace jako rozpracované změny (stav "before" z dané publikace).
-- Nepublikuje — customizer vrácení zkontroluje a publikuje stejně jako každou jinou změnu.
create or replace function public.revert_customization_publish(p_publish_id uuid)
returns int language plpgsql set search_path = public as $$
declare
  v_org uuid := public.get_my_organization_id();
  v_changes jsonb;
  v_change jsonb;
  v_count int := 0;
begin
  if not public.is_org_customizer() then
    raise exception 'Vracet změny smí jen System Customizer.';
  end if;

  select changes into v_changes from public.customization_publishes
    where id = p_publish_id and organization_id = v_org;
  if v_changes is null then
    raise exception 'Publikace nenalezena.';
  end if;

  for v_change in select * from jsonb_array_elements(v_changes) loop
    if v_change->'before' is null or jsonb_typeof(v_change->'before') = 'null' then
      -- Komponenta v té publikaci vznikla → vrácení = smazat ji.
      update public.customization_components
        set draft = null, draft_deleted = true
        where organization_id = v_org
          and component_type = v_change->>'component_type'
          and entity_name = v_change->>'entity_name'
          and key = v_change->>'key';
      -- Mezitím už smazaná komponenta — není co vracet.
      if not found then
        continue;
      end if;
    else
      insert into public.customization_components (organization_id, component_type, entity_name, key, draft)
        values (v_org, v_change->>'component_type', v_change->>'entity_name', v_change->>'key', v_change->'before')
        on conflict (organization_id, component_type, entity_name, key)
        do update set draft = excluded.draft, draft_deleted = false;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.revert_customization_publish(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Vlastní pole — sloupec `custom` na obchodních tabulkách
-- ----------------------------------------------------------------------------

-- Update slučuje klíče se stávajícími — formulář, který zobrazuje jen část vlastních polí,
-- tak nesmaže ta ostatní. Hodnota null klíč odstraní (vymazané pole).
create or replace function public.trg_merge_custom_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  new.custom := jsonb_strip_nulls(coalesce(old.custom, '{}'::jsonb) || coalesce(new.custom, '{}'::jsonb));
  return new;
end $$;

do $$
declare
  t text;
  custom_tables text[] := array[
    'accounts', 'contacts', 'leads', 'projects', 'project_templates',
    'activities', 'quotes', 'invoices', 'bugs'
  ];
begin
  foreach t in array custom_tables loop
    execute format('alter table public.%I add column custom jsonb not null default ''{}''::jsonb;', t);
    execute format('create index %I_custom_idx on public.%I using gin (custom);', t, t);
    execute format('create trigger %I_merge_custom before update on public.%I for each row execute function public.trg_merge_custom_fields();', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5) Vlastní entity — jedna tabulka pro záznamy všech vlastních entit
-- ----------------------------------------------------------------------------

create table public.custom_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_name text not null check (entity_name ~ '^new_[A-Za-z0-9_]{1,60}$'),
  name text not null,
  custom jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  owner_id uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index custom_records_organization_id_idx on public.custom_records(organization_id);
create index custom_records_entity_idx on public.custom_records(organization_id, entity_name);
create index custom_records_owner_id_idx on public.custom_records(owner_id);
create index custom_records_status_reason_id_idx on public.custom_records(status_reason_id);
create index custom_records_custom_idx on public.custom_records using gin (custom);

create trigger custom_records_before_insert before insert on public.custom_records
  for each row execute function public.trg_set_insert_system_fields();
create trigger custom_records_before_update before update on public.custom_records
  for each row execute function public.trg_set_update_system_fields();
create trigger custom_records_audit after insert or update or delete on public.custom_records
  for each row execute function public.trg_audit_log();
create trigger custom_records_owner_before_insert before insert on public.custom_records
  for each row execute function public.trg_set_insert_owner();
create trigger custom_records_merge_custom before update on public.custom_records
  for each row execute function public.trg_merge_custom_fields();

alter table public.custom_records enable row level security;
create policy custom_records_select on public.custom_records for select using (organization_id = public.get_my_organization_id());
create policy custom_records_insert on public.custom_records for insert with check (organization_id = public.get_my_organization_id());
create policy custom_records_update on public.custom_records for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy custom_records_delete on public.custom_records for delete using (organization_id = public.get_my_organization_id());

-- Důvod stavu pro vlastní entity — jeden sdílený číselník. Nové firmy ho dostanou vlastním
-- triggerem (ne přepisem dlouhé seed_default_option_sets), stávající backfillem.
create or replace function public.trg_organizations_seed_customization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_active_inactive_reason(new.id, 'custom_record_status_reason', 'Důvod stavu - Vlastní entita');
  return new;
end $$;

create trigger organizations_seed_customization
  after insert on public.organizations
  for each row execute function public.trg_organizations_seed_customization();

do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_active_inactive_reason(r.id, 'custom_record_status_reason', 'Důvod stavu - Vlastní entita');
  end loop;
end $$;
