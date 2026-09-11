-- Projektant CRM — Fáze 1: základní schéma, multi-tenancy, číselníky (option sets),
-- stav/důvod stavu (D365-style state/status reason), audit log.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- 1. ORGANIZATIONS (tenant root)
-- ============================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  modified_by uuid references auth.users(id)
);

create or replace function public.trg_organizations_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.modified_by := auth.uid();
  return new;
end $$;

create or replace function public.trg_organizations_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.modified_by := auth.uid();
  new.updated_at := now();
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end $$;

create trigger organizations_before_insert
  before insert on public.organizations
  for each row execute function public.trg_organizations_insert();

create trigger organizations_before_update
  before update on public.organizations
  for each row execute function public.trg_organizations_update();

-- ============================================================================
-- 2. USER_PREFERENCES (uživatel <-> organizace, lokalizace)
-- ============================================================================

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  timezone text not null default 'Europe/Prague',
  language text not null default 'cs-CZ',
  theme text not null default 'light',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.trg_user_preferences_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  new.organization_id := old.organization_id;
  return new;
end $$;

create trigger user_preferences_before_update
  before update on public.user_preferences
  for each row execute function public.trg_user_preferences_update();

-- Helper: aktuální organizace přihlášeného uživatele (pro RLS)
create or replace function public.get_my_organization_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.user_preferences where user_id = auth.uid();
$$;

-- ============================================================================
-- 3. OPTION_SETS / OPTION_SET_VALUES (číselníky, per-organizace, editovatelné)
-- ============================================================================

create table public.option_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (organization_id, key)
);

create table public.option_set_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  option_set_id uuid not null references public.option_sets(id) on delete cascade,
  value_key text not null,
  label text not null,
  color text,
  sort_order int not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (option_set_id, value_key)
);

-- ============================================================================
-- 4. BYZNYS ENTITY (Leads, Accounts, Contacts, Projekty, Šablony, Aktivity...)
-- ============================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  ico text,
  billing_address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  profese_id uuid references public.option_set_values(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_info text,
  demand_description text,
  expected_value numeric(14, 2),
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.template_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.project_templates(id) on delete cascade,
  name text not null,
  offset_dni int not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  datum_zahajeni date,
  deadline date,
  drive_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  termin_splneni date,
  splneno boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  activity_type_id uuid references public.option_set_values(id),
  subject text not null,
  description text,
  activity_date timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create table public.notifications_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  type text not null check (type in ('EMAIL', 'PUSH')),
  dni_predem int not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

-- Instance konkrétního in-app upozornění (zvoneček) — generováno cron jobem
-- dle notifications_config, mimo původní seznam entit v zadání (nutné pro UI).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid references public.project_milestones(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 5. AUDIT_LOGS
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);

create or replace function public.trg_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_record_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_org := old.organization_id;
    v_record_id := old.id;
  else
    v_org := new.organization_id;
    v_record_id := new.id;
  end if;

  insert into public.audit_logs (table_name, record_id, action, old_values, new_values, changed_by, organization_id)
  values (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid(),
    v_org
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- ============================================================================
-- 6. GENERICKÉ SYSTÉMOVÉ TRIGGERY pro "tenant" entity tabulky
-- ============================================================================

create or replace function public.trg_set_insert_system_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.modified_by := auth.uid();
  if new.organization_id is null then
    new.organization_id := public.get_my_organization_id();
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create or replace function public.trg_set_update_system_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.modified_by := auth.uid();
  new.updated_at := now();
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.organization_id := old.organization_id;
  return new;
end $$;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'option_sets', 'option_set_values', 'accounts', 'contacts', 'leads',
    'project_templates', 'template_milestones', 'projects', 'project_milestones',
    'activities', 'notifications_config'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('create trigger %I_before_insert before insert on public.%I for each row execute function public.trg_set_insert_system_fields();', t, t);
    execute format('create trigger %I_before_update before update on public.%I for each row execute function public.trg_set_update_system_fields();', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.trg_audit_log();', t, t);
    execute format('create index %I_organization_id_idx on public.%I(organization_id);', t, t);
  end loop;
end $$;

-- Doplňkové indexy na FK sloupce, které se hodně joinují/filtrují
create index contacts_account_id_idx on public.contacts(account_id);
create index projects_account_id_idx on public.projects(account_id);
create index template_milestones_template_id_idx on public.template_milestones(template_id);
create index project_milestones_project_id_idx on public.project_milestones(project_id);
create index notifications_config_milestone_id_idx on public.notifications_config(milestone_id);
create index activities_entity_idx on public.activities(entity_type, entity_id);
create index notifications_user_id_idx on public.notifications(user_id);
create index audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index audit_logs_table_record_idx on public.audit_logs(table_name, record_id);

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

alter table public.organizations enable row level security;
create policy organizations_select_own on public.organizations
  for select using (id = public.get_my_organization_id());
-- Insert/update/delete organizací řeší jen service_role (onboarding flow), žádná klientská policy.

alter table public.user_preferences enable row level security;
create policy user_preferences_select_own on public.user_preferences
  for select using (user_id = auth.uid());
create policy user_preferences_insert_own on public.user_preferences
  for insert with check (user_id = auth.uid());
create policy user_preferences_update_own on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid() and organization_id = public.get_my_organization_id());
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Insert/delete notifikací dělá jen service_role (cron job), žádná klientská policy.

alter table public.audit_logs enable row level security;
create policy audit_logs_select_own_org on public.audit_logs
  for select using (organization_id = public.get_my_organization_id());
-- Žádná klientská insert/update/delete policy — zapisuje jen SECURITY DEFINER trigger.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'option_sets', 'option_set_values', 'accounts', 'contacts', 'leads',
    'project_templates', 'template_milestones', 'projects', 'project_milestones',
    'activities', 'notifications_config'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_select on public.%I for select using (organization_id = public.get_my_organization_id());', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (organization_id = public.get_my_organization_id());', t, t);
    execute format('create policy %I_update on public.%I for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());', t, t);
    execute format('create policy %I_delete on public.%I for delete using (organization_id = public.get_my_organization_id());', t, t);
  end loop;
end $$;

-- ============================================================================
-- 8. SEED VÝCHOZÍCH ČÍSELNÍKŮ PŘI ZALOŽENÍ ORGANIZACE
-- ============================================================================

create or replace function public.seed_active_inactive_reason(p_org_id uuid, p_key text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  insert into option_sets (organization_id, key, label) values (p_org_id, p_key, p_label) returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'aktivni', 'Aktivní', 1, true),
    (v_set_id, p_org_id, 'neaktivni', 'Neaktivní', 2, false);
end $$;

create or replace function public.seed_default_option_sets(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  -- Profese kontaktu
  insert into option_sets (organization_id, key, label) values (p_org_id, 'profese', 'Profese kontaktu') returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, 'investor', 'Investor', 1),
    (v_set_id, p_org_id, 'architekt', 'Architekt', 2),
    (v_set_id, p_org_id, 'statik', 'Statik', 3),
    (v_set_id, p_org_id, 'geodet', 'Geodet', 4),
    (v_set_id, p_org_id, 'projektant_tzb', 'Projektant TZB', 5),
    (v_set_id, p_org_id, 'pbr', 'Požárně bezpečnostní řešení', 6),
    (v_set_id, p_org_id, 'dodavatel', 'Dodavatel/Zhotovitel', 7),
    (v_set_id, p_org_id, 'tdi', 'Technický dozor investora', 8),
    (v_set_id, p_org_id, 'stavebni_urad', 'Stavební úřad', 9),
    (v_set_id, p_org_id, 'jine', 'Jiné', 10);

  -- Typ aktivity
  insert into option_sets (organization_id, key, label) values (p_org_id, 'activity_type', 'Typ aktivity') returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, 'telefonat', 'Telefonát', 1),
    (v_set_id, p_org_id, 'email', 'E-mail', 2),
    (v_set_id, p_org_id, 'schuzka', 'Schůzka', 3),
    (v_set_id, p_org_id, 'poznamka', 'Poznámka', 4);

  -- Důvod stavu — Lead
  insert into option_sets (organization_id, key, label) values (p_org_id, 'lead_status_reason', 'Důvod stavu - Zájemce') returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'novy', 'Nový', 1, true),
    (v_set_id, p_org_id, 'kontaktovan', 'Kontaktován', 2, false),
    (v_set_id, p_org_id, 'kvalifikovan', 'Kvalifikován', 3, false),
    (v_set_id, p_org_id, 'diskvalifikovan', 'Diskvalifikován', 4, false);

  -- Důvod stavu — Projekt (Kanban)
  insert into option_sets (organization_id, key, label) values (p_org_id, 'project_status_reason', 'Důvod stavu - Projekt') returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'poptavka', 'Poptávka', 1, true),
    (v_set_id, p_org_id, 'nabidka_odeslana', 'Nabídka odeslána', 2, false),
    (v_set_id, p_org_id, 'smlouva_podepsana', 'Smlouva podepsána', 3, false),
    (v_set_id, p_org_id, 'realizace', 'Realizace', 4, false),
    (v_set_id, p_org_id, 'predani_kolaudace', 'Předání/Kolaudace', 5, false),
    (v_set_id, p_org_id, 'dokonceno', 'Dokončeno', 6, false),
    (v_set_id, p_org_id, 'zruseno', 'Zrušeno', 7, false);

  -- Generický Aktivní/Neaktivní důvod stavu pro zbylé entity
  perform public.seed_active_inactive_reason(p_org_id, 'account_status_reason', 'Důvod stavu - Firma');
  perform public.seed_active_inactive_reason(p_org_id, 'contact_status_reason', 'Důvod stavu - Kontakt');
  perform public.seed_active_inactive_reason(p_org_id, 'project_template_status_reason', 'Důvod stavu - Šablona projektu');
  perform public.seed_active_inactive_reason(p_org_id, 'template_milestone_status_reason', 'Důvod stavu - Krok šablony');
  perform public.seed_active_inactive_reason(p_org_id, 'project_milestone_status_reason', 'Důvod stavu - Milník');
  perform public.seed_active_inactive_reason(p_org_id, 'activity_status_reason', 'Důvod stavu - Aktivita');
  perform public.seed_active_inactive_reason(p_org_id, 'notification_config_status_reason', 'Důvod stavu - Konfigurace notifikace');
end $$;

create or replace function public.trg_organizations_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_option_sets(new.id);
  return new;
end $$;

create trigger organizations_after_insert
  after insert on public.organizations
  for each row execute function public.trg_organizations_after_insert();
