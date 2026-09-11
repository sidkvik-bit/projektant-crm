-- Faktury (Invoices): generované z Nabídky (Quote), vlastní číselná řada (reset 1.1. každý rok,
-- na rozdíl od Nabídek), QR Platba na PDF (viz src/lib/qrPayment.ts, src/lib/czechBank.ts).

-- Nastavení fakturace (organizace) — stejný vzor jako drive_root_folder_url.
alter table public.organizations
  add column ico text,
  add column dic text,
  add column address_street text,
  add column address_house_number text,
  add column address_city text,
  add column address_zip text,
  add column address_country text,
  add column bank_account text,
  add column invoice_number_prefix text not null default 'FAK',
  add column default_due_days int not null default 14;

-- Čítač pro číselnou řadu faktur, reset každý rok — atomický upsert-increment, bezpečný
-- i při souběžném vytváření víc faktur najednou.
create table public.invoice_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (organization_id, year)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  name text not null,
  quote_id uuid references public.quotes(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  variabilni_symbol text,
  datum_vystaveni date not null default current_date,
  datum_zdanitelneho_plneni date,
  datum_splatnosti date,
  forma_uhrady_id uuid references public.option_set_values(id),
  uhrazeno boolean not null default false,
  datum_uhrady date,
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

create index invoices_organization_id_idx on public.invoices(organization_id);
create index invoices_project_id_idx on public.invoices(project_id);
create index invoices_account_id_idx on public.invoices(account_id);
create index invoices_quote_id_idx on public.invoices(quote_id);
create index invoices_owner_id_idx on public.invoices(owner_id);
create unique index invoices_org_number_idx on public.invoices(organization_id, number);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'ks',
  unit_price numeric not null default 0,
  line_total numeric generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

-- Číslo (reset řady 1.1.) + variabilní symbol (číslice z čísla faktury) + datum splatnosti
-- (vystavení + org. default_due_days) — jen když nejsou zadané ručně (manuální přepis se
-- respektuje, ať už při založení, nebo později; tenhle trigger je "before insert" only,
-- takže pozdější ruční editace čísla přes formulář už se nikdy nepřepíše).
create or replace function public.trg_invoices_set_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_due_days int;
  v_year int;
  v_seq int;
begin
  if new.datum_vystaveni is null then
    new.datum_vystaveni := current_date;
  end if;
  if new.datum_zdanitelneho_plneni is null then
    new.datum_zdanitelneho_plneni := new.datum_vystaveni;
  end if;

  select invoice_number_prefix, default_due_days into v_prefix, v_due_days
    from public.organizations where id = new.organization_id;

  if new.datum_splatnosti is null then
    new.datum_splatnosti := new.datum_vystaveni + coalesce(v_due_days, 14);
  end if;

  if new.number is null or new.number = '' then
    v_year := extract(year from new.datum_vystaveni)::int;
    insert into public.invoice_number_counters (organization_id, year, last_number)
      values (new.organization_id, v_year, 1)
      on conflict (organization_id, year) do update set last_number = invoice_number_counters.last_number + 1
      returning last_number into v_seq;
    new.number := coalesce(v_prefix, 'FAK') || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;

  if new.variabilni_symbol is null or new.variabilni_symbol = '' then
    new.variabilni_symbol := regexp_replace(new.number, '\D', '', 'g');
  end if;

  return new;
end $$;

-- Jméno musí abecedně sedět až za invoices_before_insert (system fields), ať uvnitř téhle
-- funkce už jde spolehnout na new.organization_id.
create trigger invoices_set_defaults before insert on public.invoices
  for each row execute function public.trg_invoices_set_defaults();

create trigger invoices_before_insert before insert on public.invoices
  for each row execute function public.trg_set_insert_system_fields();
create trigger invoices_before_update before update on public.invoices
  for each row execute function public.trg_set_update_system_fields();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.trg_audit_log();
create trigger invoices_owner_before_insert before insert on public.invoices
  for each row execute function public.trg_set_insert_owner();

create trigger invoice_items_before_insert before insert on public.invoice_items
  for each row execute function public.trg_set_insert_system_fields();
create trigger invoice_items_before_update before update on public.invoice_items
  for each row execute function public.trg_set_update_system_fields();
create trigger invoice_items_audit after insert or update or delete on public.invoice_items
  for each row execute function public.trg_audit_log();

-- Přepočet součtů faktury (subtotal/vat_amount/total) při libovolné změně jejích položek —
-- stejný vzor jako trg_recalc_quote_totals.
create or replace function public.trg_recalc_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id uuid;
  v_subtotal numeric;
  v_vat_rate numeric;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  select coalesce(sum(line_total), 0) into v_subtotal from public.invoice_items where invoice_id = v_invoice_id;
  select vat_rate into v_vat_rate from public.invoices where id = v_invoice_id;

  update public.invoices
    set subtotal = v_subtotal,
        vat_amount = round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2),
        total = v_subtotal + round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2)
    where id = v_invoice_id;

  return null;
end $$;

create trigger invoice_items_recalc_totals after insert or update or delete on public.invoice_items
  for each row execute function public.trg_recalc_invoice_totals();

create or replace function public.trg_recalc_invoice_totals_on_vat_change()
returns trigger language plpgsql as $$
begin
  if new.vat_rate is distinct from old.vat_rate then
    new.vat_amount := round(new.subtotal * coalesce(new.vat_rate, 0) / 100, 2);
    new.total := new.subtotal + new.vat_amount;
  end if;
  return new;
end $$;

create trigger invoices_recalc_on_vat_change before update on public.invoices
  for each row execute function public.trg_recalc_invoice_totals_on_vat_change();

alter table public.invoices enable row level security;
create policy invoices_select on public.invoices for select using (organization_id = public.get_my_organization_id());
create policy invoices_insert on public.invoices for insert with check (organization_id = public.get_my_organization_id());
create policy invoices_update on public.invoices for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy invoices_delete on public.invoices for delete using (organization_id = public.get_my_organization_id());

alter table public.invoice_items enable row level security;
create policy invoice_items_select on public.invoice_items for select using (organization_id = public.get_my_organization_id());
create policy invoice_items_insert on public.invoice_items for insert with check (organization_id = public.get_my_organization_id());
create policy invoice_items_update on public.invoice_items for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy invoice_items_delete on public.invoice_items for delete using (organization_id = public.get_my_organization_id());

alter table public.invoice_number_counters enable row level security;
create policy invoice_number_counters_select on public.invoice_number_counters for select using (organization_id = public.get_my_organization_id());
-- Insert/update jen přes SECURITY DEFINER trigger (trg_invoices_set_defaults) — žádná klientská insert/update policy.

-- Doplní číselníky Forma úhrady + Důvod stavu - Faktura do idempotentního seedu (nové organizace) + backfill.
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

  insert into option_sets (organization_id, key, label) values (p_org_id, 'pravni_forma', 'Právní forma')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order) values
    (v_set_id, p_org_id, '000', 'Zatím neurčeno', 1),
    (v_set_id, p_org_id, '101', 'Fyzická osoba podnikající dle živnostenského zákona', 2),
    (v_set_id, p_org_id, '105', 'Fyzická osoba podnikající dle jiných zákonů než živnostenského a zákona o zemědělství', 3),
    (v_set_id, p_org_id, '107', 'Zemědělský podnikatel - fyzická osoba', 4),
    (v_set_id, p_org_id, '111', 'Veřejná obchodní společnost', 5),
    (v_set_id, p_org_id, '112', 'Společnost s ručením omezeným', 6),
    (v_set_id, p_org_id, '113', 'Společnost komanditní', 7),
    (v_set_id, p_org_id, '115', 'Společný podnik', 8),
    (v_set_id, p_org_id, '116', 'Zájmové sdružení', 9),
    (v_set_id, p_org_id, '117', 'Nadace', 10),
    (v_set_id, p_org_id, '118', 'Nadační fond', 11),
    (v_set_id, p_org_id, '121', 'Akciová společnost', 12),
    (v_set_id, p_org_id, '141', 'Obecně prospěšná společnost', 13),
    (v_set_id, p_org_id, '145', 'Společenství vlastníků jednotek', 14),
    (v_set_id, p_org_id, '151', 'Komoditní burza', 15),
    (v_set_id, p_org_id, '161', 'Ústav', 16),
    (v_set_id, p_org_id, '205', 'Družstvo', 17),
    (v_set_id, p_org_id, '301', 'Státní podnik', 18),
    (v_set_id, p_org_id, '313', 'Česká národní banka', 19),
    (v_set_id, p_org_id, '325', 'Organizační složka státu', 20),
    (v_set_id, p_org_id, '326', 'Stálý rozhodčí soud', 21),
    (v_set_id, p_org_id, '331', 'Příspěvková organizace', 22),
    (v_set_id, p_org_id, '352', 'Státní organizace Správa železnic', 23),
    (v_set_id, p_org_id, '353', 'Rada pro veřejný dohled nad auditem', 24),
    (v_set_id, p_org_id, '361', 'Veřejnoprávní instituce (ČT,ČRo,ČTK)', 25),
    (v_set_id, p_org_id, '381', 'Fond (ze zákona)', 26),
    (v_set_id, p_org_id, '391', 'Zdravotní pojišťovna', 27),
    (v_set_id, p_org_id, '421', 'Odštěpný závod zahraniční právnické osoby', 28),
    (v_set_id, p_org_id, '422', 'Organizační složka zahraničního nadačního fondu', 29),
    (v_set_id, p_org_id, '423', 'Organizační složka zahraniční nadace', 30),
    (v_set_id, p_org_id, '424', 'Zahraniční fyzická osoba', 31),
    (v_set_id, p_org_id, '425', 'Odštěpný závod zahraniční fyzické osoby', 32),
    (v_set_id, p_org_id, '426', 'Zastoupení zahraniční banky', 33),
    (v_set_id, p_org_id, '501', 'Odštěpný závod nebo jiná organizační složka podniku zapisující se do obchodního rejstříku', 34),
    (v_set_id, p_org_id, '521', 'Samostatná drobná provozovna obecního úřadu', 35),
    (v_set_id, p_org_id, '541', 'Podílový, penzijní fond', 36),
    (v_set_id, p_org_id, '601', 'Vysoká škola (veřejná, státní)', 37),
    (v_set_id, p_org_id, '641', 'Školská právnická osoba', 38),
    (v_set_id, p_org_id, '661', 'Veřejná výzkumná instituce', 39),
    (v_set_id, p_org_id, '704', 'Zvláštní organizace pro zastoupení českých zájmů v mezinárodních nevládních organizacích', 40),
    (v_set_id, p_org_id, '705', 'Podnik nebo hospodářské zařízení sdružení', 41),
    (v_set_id, p_org_id, '706', 'Spolek', 42),
    (v_set_id, p_org_id, '707', 'Odborová organizace', 43),
    (v_set_id, p_org_id, '708', 'Organizace zaměstnavatelů', 44),
    (v_set_id, p_org_id, '711', 'Politická strana, politické hnutí', 45),
    (v_set_id, p_org_id, '715', 'Podnik nebo hospodářské zařízení politické strany', 46),
    (v_set_id, p_org_id, '721', 'Církve a náboženské společnosti', 47),
    (v_set_id, p_org_id, '722', 'Evidované církevní právnické osoby', 48),
    (v_set_id, p_org_id, '723', 'Svazy církví a náboženských společností', 49),
    (v_set_id, p_org_id, '733', 'Organizační jednotka odborové organizace a organizace zaměstnavatelů', 50),
    (v_set_id, p_org_id, '734', 'Organizační jednotka zvláštní organizace pro zastoupení českých zájmů v mezinárodních nevládních organizacích', 51),
    (v_set_id, p_org_id, '736', 'Pobočný spolek', 52),
    (v_set_id, p_org_id, '741', 'Stavovská organizace - profesní komora', 53),
    (v_set_id, p_org_id, '745', 'Komora (s výjimkou profesních komor)', 54),
    (v_set_id, p_org_id, '751', 'Zájmové sdružení právnických osob', 55),
    (v_set_id, p_org_id, '761', 'Honební společenstvo', 56),
    (v_set_id, p_org_id, '771', 'Dobrovolný svazek obcí', 57),
    (v_set_id, p_org_id, '801', 'Obec nebo městská část hlavního města Prahy', 58),
    (v_set_id, p_org_id, '804', 'Kraj a hl.m.Praha', 59),
    (v_set_id, p_org_id, '901', 'Zastupitelský orgán jiných států', 60),
    (v_set_id, p_org_id, '906', 'Zahraniční spolek', 61),
    (v_set_id, p_org_id, '907', 'Mezinárodní odborová organizace', 62),
    (v_set_id, p_org_id, '908', 'Mezinárodní organizace zaměstnavatelů', 63),
    (v_set_id, p_org_id, '911', 'Zahraniční kulturní, informační středisko, rozhlasová, tisková a televizní agentura', 64),
    (v_set_id, p_org_id, '921', 'Mezinárodní nevládní organizace', 65),
    (v_set_id, p_org_id, '922', 'Organizační jednotka mezinárodní nevládní organizace', 66),
    (v_set_id, p_org_id, '931', 'Evropské hospodářské zájmové sdružení', 67),
    (v_set_id, p_org_id, '932', 'Evropská společnost', 68),
    (v_set_id, p_org_id, '933', 'Evropská družstevní společnost', 69),
    (v_set_id, p_org_id, '936', 'Zahraniční pobočný spolek', 70),
    (v_set_id, p_org_id, '941', 'Evropské seskupení pro územní spolupráci', 71),
    (v_set_id, p_org_id, '950', 'Subjekt právním řádem výslovně neupravený', 72),
    (v_set_id, p_org_id, '951', 'Mezinárodní vojenská organizace vzniklá na základě mezinárodní smlouvy', 73),
    (v_set_id, p_org_id, '952', 'Konsorcium evropské výzkumné infrastruktury', 74),
    (v_set_id, p_org_id, '960', 'Právnická osoba zřízená zvláštním zákonem zapisovaná do veřejného rejstříku', 75)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'forma_uhrady', 'Forma úhrady')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'prevodem', 'Bankovní převod', 1, true),
    (v_set_id, p_org_id, 'hotove', 'Hotově', 2, false),
    (v_set_id, p_org_id, 'kartou', 'Kartou', 3, false)
  on conflict (option_set_id, value_key) do nothing;

  insert into option_sets (organization_id, key, label) values (p_org_id, 'invoice_status_reason', 'Důvod stavu - Faktura')
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default) values
    (v_set_id, p_org_id, 'koncept', 'Koncept', 1, true),
    (v_set_id, p_org_id, 'vystavena', 'Vystavena', 2, false),
    (v_set_id, p_org_id, 'uhrazena', 'Uhrazena', 3, false),
    (v_set_id, p_org_id, 'stornovana', 'Stornována', 4, false)
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

do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_default_option_sets(r.id);
  end loop;
end $$;
