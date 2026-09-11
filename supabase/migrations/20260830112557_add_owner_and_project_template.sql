-- D365 Sales vzor: univerzální "Owner" na každé byznys entitě (výchozí = tvůrce
-- záznamu, přeřaditelné), rozšířená pole na entitách (inspirace D365 Sales),
-- vazba Projektu na šablonu, a nové číselníky pro Lead (source/rating).

-- ============================================================================
-- 1. OWNER na všech byznys entitách
-- ============================================================================

-- Samostatná trigger funkce jen pro owner_id — připojená JEN na tabulky, co
-- ten sloupec mají. option_sets/option_set_values (číselníky, ne "vlastněné"
-- záznamy) ji nemají vůbec, takže sdílená trg_set_insert_system_fields
-- zůstává beze změny a nemusí nic řešit s TG_TABLE_NAME.
create or replace function public.trg_set_insert_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end $$;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'leads', 'accounts', 'contacts', 'project_templates', 'template_milestones',
    'projects', 'project_milestones', 'activities', 'notifications_config'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I add column owner_id uuid references public.users(user_id);', t);
    execute format('create index %I_owner_id_idx on public.%I(owner_id);', t, t);
    execute format('create trigger %I_owner_before_insert before insert on public.%I for each row execute function public.trg_set_insert_owner();', t, t);
  end loop;
end $$;

-- ============================================================================
-- 2. Rozšířená pole (D365 Sales inspirace)
-- ============================================================================

alter table public.accounts
  add column phone text,
  add column email text,
  add column website text,
  add column industry text,
  add column description text;

-- Contact: name -> first_name/last_name (konzistentní se strukturou users)
alter table public.contacts rename column name to first_name;
alter table public.contacts
  add column last_name text,
  add column mobile_phone text,
  add column description text;

alter table public.leads
  add column email text,
  add column phone text,
  add column company_name text,
  add column lead_source_id uuid references public.option_set_values(id),
  add column rating_id uuid references public.option_set_values(id);

alter table public.project_templates
  add column description text;

alter table public.template_milestones
  add column description text;

alter table public.projects
  add column project_template_id uuid references public.project_templates(id),
  add column primary_contact_id uuid references public.contacts(id),
  add column budget numeric(14, 2),
  add column description text;

alter table public.project_milestones
  add column description text;

alter table public.activities
  add column duration_minutes int;

-- ============================================================================
-- 3. Idempotentní seed (umožní bezpečně doplnit nové číselníky i existujícím
--    organizacím, ne jen nově založeným)
-- ============================================================================

create or replace function public.seed_active_inactive_reason(p_org_id uuid, p_key text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  insert into option_sets (organization_id, key, label) values (p_org_id, p_key, p_label)
    on conflict (organization_id, key) do update set label = excluded.label
    returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'aktivni', 'Aktivní', 1, true),
    (v_set_id, p_org_id, 'neaktivni', 'Neaktivní', 2, false)
  on conflict (option_set_id, value_key) do nothing;
end $$;

create or replace function public.seed_default_option_sets(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  insert into option_sets (organization_id, key, label) values (p_org_id, 'profese', 'Profese kontaktu')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
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
    (v_set_id, p_org_id, 'jine', 'Jiné', 10)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'activity_type', 'Typ aktivity')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, 'telefonat', 'Telefonát', 1),
    (v_set_id, p_org_id, 'email', 'E-mail', 2),
    (v_set_id, p_org_id, 'schuzka', 'Schůzka', 3),
    (v_set_id, p_org_id, 'poznamka', 'Poznámka', 4)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'lead_status_reason', 'Důvod stavu - Zájemce')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'novy', 'Nový', 1, true),
    (v_set_id, p_org_id, 'kontaktovan', 'Kontaktován', 2, false),
    (v_set_id, p_org_id, 'kvalifikovan', 'Kvalifikován', 3, false),
    (v_set_id, p_org_id, 'diskvalifikovan', 'Diskvalifikován', 4, false)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'project_status_reason', 'Důvod stavu - Projekt')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'poptavka', 'Poptávka', 1, true),
    (v_set_id, p_org_id, 'nabidka_odeslana', 'Nabídka odeslána', 2, false),
    (v_set_id, p_org_id, 'smlouva_podepsana', 'Smlouva podepsána', 3, false),
    (v_set_id, p_org_id, 'realizace', 'Realizace', 4, false),
    (v_set_id, p_org_id, 'predani_kolaudace', 'Předání/Kolaudace', 5, false),
    (v_set_id, p_org_id, 'dokonceno', 'Dokončeno', 6, false),
    (v_set_id, p_org_id, 'zruseno', 'Zrušeno', 7, false)
  on conflict (option_set_id, value_key) do nothing;

  -- Nové: D365-style Lead Source a Rating
  insert into option_sets (organization_id, key, label) values (p_org_id, 'lead_source', 'Zdroj zájemce')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, 'web', 'Web', 1),
    (v_set_id, p_org_id, 'doporuceni', 'Doporučení', 2),
    (v_set_id, p_org_id, 'socialni_site', 'Sociální sítě', 3),
    (v_set_id, p_org_id, 'veletrh_akce', 'Veletrh / akce', 4),
    (v_set_id, p_org_id, 'stavajici_klient', 'Stávající klient', 5),
    (v_set_id, p_org_id, 'jine', 'Jiné', 6)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'lead_rating', 'Hodnocení zájemce')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, 'horky', 'Horký', 1),
    (v_set_id, p_org_id, 'vlazny', 'Vlažný', 2),
    (v_set_id, p_org_id, 'studeny', 'Studený', 3)
  on conflict (option_set_id, value_key) do nothing;

  perform public.seed_active_inactive_reason(p_org_id, 'account_status_reason', 'Důvod stavu - Firma');
  perform public.seed_active_inactive_reason(p_org_id, 'contact_status_reason', 'Důvod stavu - Kontakt');
  perform public.seed_active_inactive_reason(p_org_id, 'project_template_status_reason', 'Důvod stavu - Šablona projektu');
  perform public.seed_active_inactive_reason(p_org_id, 'template_milestone_status_reason', 'Důvod stavu - Krok šablony');
  perform public.seed_active_inactive_reason(p_org_id, 'project_milestone_status_reason', 'Důvod stavu - Milník');
  perform public.seed_active_inactive_reason(p_org_id, 'activity_status_reason', 'Důvod stavu - Aktivita');
  perform public.seed_active_inactive_reason(p_org_id, 'notification_config_status_reason', 'Důvod stavu - Konfigurace notifikace');
end $$;

-- Backfill nových číselníků pro už existující organizace (funkce je teď idempotentní).
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_default_option_sets(r.id);
  end loop;
end $$;
