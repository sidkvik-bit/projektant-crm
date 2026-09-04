-- Nabídky (Quotes): nabídka k projektu, s položkami (produkty/služby), auto-generovaným
-- číslem a součty přepočítávanými triggerem z quote_items — mimo původní seznam entit
-- v zadání, business požadavek na nabídkové řízení k projektům.

create sequence public.quotes_number_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  name text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  valid_until date,
  vat_rate numeric not null default 21,
  subtotal numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  note text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  status_reason_id uuid references public.option_set_values(id),
  owner_id uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index quotes_organization_id_idx on public.quotes(organization_id);
create index quotes_project_id_idx on public.quotes(project_id);
create index quotes_account_id_idx on public.quotes(account_id);
create index quotes_owner_id_idx on public.quotes(owner_id);
create unique index quotes_org_number_idx on public.quotes(organization_id, number);

-- Položky nabídky (produkty/služby) — čistě podřízená tabulka projektu Nabídka,
-- bez vlastního status/owner (stejný vzor jako project_milestones).
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'ks',
  unit_price numeric not null default 0,
  line_total numeric generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quote_items_quote_id_idx on public.quote_items(quote_id);

-- Auto číslo nabídky tvaru "NAB-2026-0001" — sdílená sekvence napříč organizacemi
-- (pořadí nemusí být souvislé per organizace, jen unikátní a monotónně rostoucí).
create or replace function public.trg_set_quote_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'NAB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quotes_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create trigger quotes_set_number before insert on public.quotes
  for each row execute function public.trg_set_quote_number();

create trigger quotes_before_insert before insert on public.quotes
  for each row execute function public.trg_set_insert_system_fields();
create trigger quotes_before_update before update on public.quotes
  for each row execute function public.trg_set_update_system_fields();
create trigger quotes_audit after insert or update or delete on public.quotes
  for each row execute function public.trg_audit_log();
create trigger quotes_owner_before_insert before insert on public.quotes
  for each row execute function public.trg_set_insert_owner();

create trigger quote_items_before_insert before insert on public.quote_items
  for each row execute function public.trg_set_insert_system_fields();
create trigger quote_items_before_update before update on public.quote_items
  for each row execute function public.trg_set_update_system_fields();
create trigger quote_items_audit after insert or update or delete on public.quote_items
  for each row execute function public.trg_audit_log();

-- Přepočet součtů nabídky (subtotal/vat_amount/total) při libovolné změně jejích položek.
create or replace function public.trg_recalc_quote_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quote_id uuid;
  v_subtotal numeric;
  v_vat_rate numeric;
begin
  v_quote_id := coalesce(new.quote_id, old.quote_id);

  select coalesce(sum(line_total), 0) into v_subtotal from public.quote_items where quote_id = v_quote_id;
  select vat_rate into v_vat_rate from public.quotes where id = v_quote_id;

  update public.quotes
    set subtotal = v_subtotal,
        vat_amount = round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2),
        total = v_subtotal + round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2)
    where id = v_quote_id;

  return null;
end $$;

create trigger quote_items_recalc_totals after insert or update or delete on public.quote_items
  for each row execute function public.trg_recalc_quote_totals();

-- Přepočet i při ruční změně sazby DPH přímo na nabídce (položky se přitom nemění).
create or replace function public.trg_recalc_quote_totals_on_vat_change()
returns trigger language plpgsql as $$
begin
  if new.vat_rate is distinct from old.vat_rate then
    new.vat_amount := round(new.subtotal * coalesce(new.vat_rate, 0) / 100, 2);
    new.total := new.subtotal + new.vat_amount;
  end if;
  return new;
end $$;

create trigger quotes_recalc_on_vat_change before update on public.quotes
  for each row execute function public.trg_recalc_quote_totals_on_vat_change();

alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select using (organization_id = public.get_my_organization_id());
create policy quotes_insert on public.quotes for insert with check (organization_id = public.get_my_organization_id());
create policy quotes_update on public.quotes for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy quotes_delete on public.quotes for delete using (organization_id = public.get_my_organization_id());

alter table public.quote_items enable row level security;
create policy quote_items_select on public.quote_items for select using (organization_id = public.get_my_organization_id());
create policy quote_items_insert on public.quote_items for insert with check (organization_id = public.get_my_organization_id());
create policy quote_items_update on public.quote_items for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy quote_items_delete on public.quote_items for delete using (organization_id = public.get_my_organization_id());

-- Doplní číselník Důvod stavu - Nabídka do idempotentního seedu (nové organizace) + backfill.
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

  insert into option_sets (organization_id, key, label) values (p_org_id, 'quote_status_reason', 'Důvod stavu - Nabídka')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'koncept', 'Koncept', 1, true),
    (v_set_id, p_org_id, 'odeslana', 'Odesláno klientovi', 2, false),
    (v_set_id, p_org_id, 'schvalena', 'Schváleno klientem', 3, false),
    (v_set_id, p_org_id, 'zamitnuta', 'Zamítnuto', 4, false),
    (v_set_id, p_org_id, 'expirovala', 'Expirovalo', 5, false)
  on conflict (option_set_id, value_key) do nothing;

  perform public.seed_active_inactive_reason(p_org_id, 'account_status_reason', 'Důvod stavu - Firma');
  perform public.seed_active_inactive_reason(p_org_id, 'contact_status_reason', 'Důvod stavu - Kontakt');
  perform public.seed_active_inactive_reason(p_org_id, 'project_template_status_reason', 'Důvod stavu - Šablona projektu');
  perform public.seed_active_inactive_reason(p_org_id, 'template_milestone_status_reason', 'Důvod stavu - Krok šablony');
  perform public.seed_active_inactive_reason(p_org_id, 'project_milestone_status_reason', 'Důvod stavu - Milník');
  perform public.seed_active_inactive_reason(p_org_id, 'activity_status_reason', 'Důvod stavu - Aktivita');
  perform public.seed_active_inactive_reason(p_org_id, 'notification_config_status_reason', 'Důvod stavu - Konfigurace notifikace');
  perform public.seed_active_inactive_reason(p_org_id, 'bug_status_reason', 'Důvod stavu - Bug');
end $$;

-- quote_status_reason má vlastní hodnoty (ne jen aktivní/neaktivní) — backfill zavolá
-- celý (idempotentní) seed znovu, stejný vzor jako u zavedení project_status_reason.
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_default_option_sets(r.id);
  end loop;
end $$;
