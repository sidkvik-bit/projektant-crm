-- Dávka úprav podle připomínek projektanta, který appku testoval.
--
-- 1) IČO na kontaktu — OSVČ bez samostatné firmy ho dnes nemá kam napsat, a na faktuře pak chybí.
-- 2) Parcely projektu jako samostatná tabulka — projektant běžně staví na několika parcelách
--    a rozlišení stavební/pozemková je údaj z katastru, ne kosmetika.
-- 3) Název dodavatele a výchozí platnost nabídky do nastavení firmy.
-- 4) Číslování nabídek: dnes jede ze SDÍLENÉ sekvence napříč všemi organizacemi, takže čísla
--    přeskakují podle toho, kdo zrovna vystavil nabídku. To je chyba, ne záměr.
-- 5) Číslo faktury ve tvaru YYYYMMNN (např. 20260901) s řadou resetovanou po měsících.

-- ---------------------------------------------------------------------------
-- 1. IČO na kontaktu
-- ---------------------------------------------------------------------------

-- Na dokladu se použije IČO firmy; když kontakt firmu nemá, tohle. Stejné pravidlo jako
-- u názvu a adresy (viz 20260925130000).
alter table public.contacts add column ico text;

-- ---------------------------------------------------------------------------
-- 2. Parcely projektu
-- ---------------------------------------------------------------------------

-- Systémové sloupce MUSÍ existovat dřív, než se připojí generické triggery — ty je nastavují
-- bezpodmínečně. Viz 20260904161500_fix_quote_items_system_fields.sql, kde to jednou chybělo.
create table public.project_parcels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parcelni_cislo text not null,
  -- Katastr rozlišuje parcely stavební a pozemkové; jsou to dvě pevné hodnoty dané zákonem,
  -- proto check a ne číselník (číselník by se musel seedovat a ta funkce je křehká, viz §8
  -- v 20260925120000).
  druh text not null default 'pozemkova' check (druh in ('stavebni', 'pozemkova')),
  katastralni_uzemi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (project_id, parcelni_cislo, druh)
);

create index project_parcels_organization_id_idx on public.project_parcels(organization_id);
create index project_parcels_project_id_idx on public.project_parcels(project_id);

-- Generická mašinerie ručně — smyčky v init_core_schema.sql už dávno proběhly. Bez owner
-- triggeru, vzorem je quote_items (čistá podřízená tabulka), ne project_milestones.
create trigger project_parcels_before_insert before insert on public.project_parcels
  for each row execute function public.trg_set_insert_system_fields();
create trigger project_parcels_before_update before update on public.project_parcels
  for each row execute function public.trg_set_update_system_fields();
create trigger project_parcels_audit after insert or update or delete on public.project_parcels
  for each row execute function public.trg_audit_log();

alter table public.project_parcels enable row level security;
create policy project_parcels_select on public.project_parcels
  for select using (organization_id = public.get_my_organization_id());
create policy project_parcels_insert on public.project_parcels
  for insert with check (organization_id = public.get_my_organization_id());
create policy project_parcels_update on public.project_parcels
  for update using (organization_id = public.get_my_organization_id())
  with check (organization_id = public.get_my_organization_id());
create policy project_parcels_delete on public.project_parcels
  for delete using (organization_id = public.get_my_organization_id());

-- Původní jednorázové pole na projektu zůstává jako záloha dat; nové zadávání jde přes tabulku.
comment on column public.projects.parcelni_cislo is
  'Historické jednotlivé pole. Nové parcely se zadávají do project_parcels.';

-- ---------------------------------------------------------------------------
-- 3. Nastavení firmy
-- ---------------------------------------------------------------------------

-- Dodavatel na faktuře je právní subjekt, ne přihlášený uživatel — proto na organizaci, ne na
-- users. Když zůstane prázdné, použije se název organizace (dnešní chování). Umožňuje mít
-- v CRM "VHarch" a na faktuře "Jan Havlín".
alter table public.organizations
  add column supplier_name text,
  add column default_quote_validity_days int not null default 30;

-- ---------------------------------------------------------------------------
-- 4. Číslování nabídek: per organizace místo sdílené sekvence
-- ---------------------------------------------------------------------------

create table public.quote_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (organization_id, year)
);

alter table public.quote_number_counters enable row level security;
-- Čte a zapisuje jen trigger (security definer), klientský přístup není potřeba.

-- Navázat na už vystavené nabídky, ať nová čísla nekolidují.
insert into public.quote_number_counters (organization_id, year, last_number)
select q.organization_id,
       extract(year from q.created_at)::int,
       max(coalesce(nullif(regexp_replace(q.number, '^NAB-\d{4}-', ''), '')::int, 0))
from public.quotes q
where q.number ~ '^NAB-\d{4}-\d+$'
group by q.organization_id, extract(year from q.created_at)::int
on conflict (organization_id, year) do nothing;

create or replace function public.trg_set_quote_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_year int;
  v_seq int;
begin
  if new.number is null or new.number = '' then
    v_year := extract(year from now())::int;
    insert into public.quote_number_counters (organization_id, year, last_number)
      values (new.organization_id, v_year, 1)
      on conflict (organization_id, year) do update set last_number = quote_number_counters.last_number + 1
      returning last_number into v_seq;
    new.number := 'NAB-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

drop sequence if exists public.quotes_number_seq;

-- ---------------------------------------------------------------------------
-- 5. Číslo faktury YYYYMMNN, řada po měsících
-- ---------------------------------------------------------------------------

-- Počítadlo se rozšiřuje o měsíc. Je to čistě odvozená hodnota, takže se přepočítá z už
-- vystavených faktur — kdyby se jen přidal sloupec, stará řada by se počítala znovu od jedničky.
drop table public.invoice_number_counters;
create table public.invoice_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  month int not null,
  last_number int not null default 0,
  primary key (organization_id, year, month)
);

alter table public.invoice_number_counters enable row level security;

insert into public.invoice_number_counters (organization_id, year, month, last_number)
select i.organization_id,
       extract(year from i.datum_vystaveni)::int,
       extract(month from i.datum_vystaveni)::int,
       count(*)
from public.invoices i
group by i.organization_id, extract(year from i.datum_vystaveni)::int, extract(month from i.datum_vystaveni)::int;

-- Prefix se do čísla faktury už nepromítá — tester chce holé 20260901. Sloupec zůstává,
-- ale formulář ho nadále nenabízí.
create or replace function public.trg_invoices_set_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_due_days int;
  v_year int;
  v_month int;
  v_seq int;
begin
  if new.datum_vystaveni is null then
    new.datum_vystaveni := current_date;
  end if;
  if new.datum_zdanitelneho_plneni is null then
    new.datum_zdanitelneho_plneni := new.datum_vystaveni;
  end if;

  select default_due_days into v_due_days
    from public.organizations where id = new.organization_id;

  if new.datum_splatnosti is null then
    new.datum_splatnosti := new.datum_vystaveni + coalesce(v_due_days, 14);
  end if;

  if new.number is null or new.number = '' then
    v_year := extract(year from new.datum_vystaveni)::int;
    v_month := extract(month from new.datum_vystaveni)::int;
    insert into public.invoice_number_counters (organization_id, year, month, last_number)
      values (new.organization_id, v_year, v_month, 1)
      on conflict (organization_id, year, month)
        do update set last_number = invoice_number_counters.last_number + 1
      returning last_number into v_seq;
    -- YYYY + MM + pořadí v měsíci, např. 20260901. Nad 99 faktur za měsíc se řada přirozeně
    -- rozšíří na tři číslice.
    new.number := v_year::text || lpad(v_month::text, 2, '0') || lpad(v_seq::text, 2, '0');
  end if;

  if new.variabilni_symbol is null or new.variabilni_symbol = '' then
    new.variabilni_symbol := regexp_replace(new.number, '\D', '', 'g');
  end if;

  return new;
end $$;
