-- Cenová nabídka po fázích a profily dodavatele.
--
-- Proč: projektant nenabízí „kusy × cena“, ale fáze práce (pasport, studie, DSP) — každá má
-- název, odrážky s obsahem a jednu cenu. Texty fází se opakují, proto jsou ve firemních
-- šablonách (Nastavení → Šablony fází) a do nabídky se kopírují; úprava v nabídce šablonu nemění.
--
-- Nabídky a faktury navíc často vystavuje jiná osoba (nabídky autorizovaný architekt, faktury
-- jiný živnostník), proto profily dodavatele místo jedné sady údajů na organizaci. Údaje na
-- organizations zůstávají jako záloha pro firmy bez profilu.
--
-- Staré nabídky s položkami (quote_items) fungují dál beze změny.

-- ---------------------------------------------------------------------------
-- 1. Profily dodavatele
-- ---------------------------------------------------------------------------

create table public.supplier_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nazev text not null,                       -- jak se profil jmenuje ve výběru, např. „Nabídky – Hájek“
  jmeno text not null,                       -- tiskne se jako dodavatel
  address_street text,
  address_house_number text,
  address_city text,
  address_zip text,
  ico text,
  dic text,
  je_platce_dph boolean not null default false,
  bank_account text,
  email text,
  telefon text,
  web text,
  misto_vystaveni text,                      -- celý text i s předložkou: „V Turnově“
  logo_url text,
  default_due_days int not null default 14 check (default_due_days between 0 and 365),
  platnost_nabidky_mesice int not null default 3 check (platnost_nabidky_mesice between 0 and 36),
  vychozi_poznamky text,                     -- jedna poznámka = jeden řádek
  pouzit_pro_nabidky boolean not null default false,
  pouzit_pro_faktury boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index supplier_profiles_organization_id_idx on public.supplier_profiles(organization_id);
-- Nejvýš jeden výchozí profil pro nabídky a jeden pro faktury v rámci firmy.
create unique index supplier_profiles_default_quotes_key
  on public.supplier_profiles(organization_id) where pouzit_pro_nabidky;
create unique index supplier_profiles_default_invoices_key
  on public.supplier_profiles(organization_id) where pouzit_pro_faktury;

create trigger supplier_profiles_before_insert before insert on public.supplier_profiles
  for each row execute function public.trg_set_insert_system_fields();
create trigger supplier_profiles_before_update before update on public.supplier_profiles
  for each row execute function public.trg_set_update_system_fields();
create trigger supplier_profiles_audit after insert or update or delete on public.supplier_profiles
  for each row execute function public.trg_audit_log();

alter table public.supplier_profiles enable row level security;
create policy supplier_profiles_select on public.supplier_profiles for select using (organization_id = public.get_my_organization_id());
create policy supplier_profiles_insert on public.supplier_profiles for insert with check (organization_id = public.get_my_organization_id());
create policy supplier_profiles_update on public.supplier_profiles for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy supplier_profiles_delete on public.supplier_profiles for delete using (organization_id = public.get_my_organization_id());

-- ---------------------------------------------------------------------------
-- 2. Šablony fází (PAS, STU, DSP…)
-- ---------------------------------------------------------------------------

create table public.quote_phase_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kod text not null,                         -- krátká zkratka do výběru: PAS, STU, DSP
  nazev text not null,
  odrazky text[] not null default '{}',
  cena numeric(12,2) not null default 0 check (cena >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index quote_phase_templates_organization_id_idx on public.quote_phase_templates(organization_id);

create trigger quote_phase_templates_before_insert before insert on public.quote_phase_templates
  for each row execute function public.trg_set_insert_system_fields();
create trigger quote_phase_templates_before_update before update on public.quote_phase_templates
  for each row execute function public.trg_set_update_system_fields();
create trigger quote_phase_templates_audit after insert or update or delete on public.quote_phase_templates
  for each row execute function public.trg_audit_log();

alter table public.quote_phase_templates enable row level security;
create policy quote_phase_templates_select on public.quote_phase_templates for select using (organization_id = public.get_my_organization_id());
create policy quote_phase_templates_insert on public.quote_phase_templates for insert with check (organization_id = public.get_my_organization_id());
create policy quote_phase_templates_update on public.quote_phase_templates for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy quote_phase_templates_delete on public.quote_phase_templates for delete using (organization_id = public.get_my_organization_id());

-- ---------------------------------------------------------------------------
-- 3. Fáze nabídky — kopie šablony, upravitelná v nabídce
-- ---------------------------------------------------------------------------

create table public.quote_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  kod text,                                  -- ze které šablony vznikla (jen informace)
  nazev text not null,
  odrazky text[] not null default '{}',
  cena numeric(12,2) not null default 0 check (cena >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid
);

create index quote_phases_organization_id_idx on public.quote_phases(organization_id);
create index quote_phases_quote_id_idx on public.quote_phases(quote_id);

create trigger quote_phases_before_insert before insert on public.quote_phases
  for each row execute function public.trg_set_insert_system_fields();
create trigger quote_phases_before_update before update on public.quote_phases
  for each row execute function public.trg_set_update_system_fields();
create trigger quote_phases_audit after insert or update or delete on public.quote_phases
  for each row execute function public.trg_audit_log();

alter table public.quote_phases enable row level security;
create policy quote_phases_select on public.quote_phases for select using (organization_id = public.get_my_organization_id());
create policy quote_phases_insert on public.quote_phases for insert with check (organization_id = public.get_my_organization_id());
create policy quote_phases_update on public.quote_phases for update using (organization_id = public.get_my_organization_id()) with check (organization_id = public.get_my_organization_id());
create policy quote_phases_delete on public.quote_phases for delete using (organization_id = public.get_my_organization_id());

-- ---------------------------------------------------------------------------
-- 4. Nová pole nabídky
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column if not exists supplier_profile_id uuid references public.supplier_profiles(id) on delete set null,
  add column if not exists nazev_stavby text,
  add column if not exists zadavatel_text text,
  add column if not exists poznamky text,
  add column if not exists zobrazit_soucet boolean not null default false;

create index if not exists quotes_supplier_profile_id_idx on public.quotes(supplier_profile_id);

-- ---------------------------------------------------------------------------
-- 5. Součet nabídky = položky + fáze
-- ---------------------------------------------------------------------------
-- Security invoker: počítá pod identitou uživatele, RLS hlídá organizaci. Stávající
-- trg_recalc_quote_totals (položky) zůstává; tenhle trigger na quote_items se spouští po něm
-- (triggery téže události běží abecedně: recalc_totals < recalc_with_phases) a přičte fáze.

create or replace function public.trg_recalc_quote_totals_with_phases()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_subtotal numeric;
  v_vat_rate numeric;
begin
  select coalesce((select sum(line_total) from public.quote_items where quote_id = v_quote_id), 0)
       + coalesce((select sum(cena) from public.quote_phases where quote_id = v_quote_id), 0)
    into v_subtotal;
  select vat_rate into v_vat_rate from public.quotes where id = v_quote_id;

  update public.quotes
    set subtotal = v_subtotal,
        vat_amount = round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2),
        total = v_subtotal + round(v_subtotal * coalesce(v_vat_rate, 0) / 100, 2)
    where id = v_quote_id;
  return null;
end $$;

create trigger quote_phases_recalc_totals after insert or update or delete on public.quote_phases
  for each row execute function public.trg_recalc_quote_totals_with_phases();
create trigger quote_items_recalc_with_phases after insert or update or delete on public.quote_items
  for each row execute function public.trg_recalc_quote_totals_with_phases();

-- ---------------------------------------------------------------------------
-- 6. Číslo nabídky CN-2026-001
-- ---------------------------------------------------------------------------
-- Řada a počítadlo zůstávají (trg_set_quote_number, quote_number_counters); tenhle trigger
-- běží po něm (quotes_set_number < quotes_set_number_format) a jen přepíše tvar. Ruční číslo
-- (jiný tvar než NAB-RRRR-NNNN) nechává být. Od 1000 nabídek za rok se číslo nezkracuje.

create or replace function public.trg_format_quote_number()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_parts text[];
begin
  v_parts := regexp_match(new.number, '^NAB-(\d{4})-(\d+)$');
  if v_parts is not null then
    new.number := 'CN-' || v_parts[1] || '-' ||
      case when v_parts[2]::int < 1000 then lpad((v_parts[2]::int)::text, 3, '0') else (v_parts[2]::int)::text end;
  end if;
  return new;
end $$;

create trigger quotes_set_number_format before insert on public.quotes
  for each row execute function public.trg_format_quote_number();
