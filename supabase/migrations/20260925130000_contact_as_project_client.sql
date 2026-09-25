-- Klientem projektu, nabídky i faktury je nově KONTAKT, ne firma. Firma zůstává beze změny —
-- kontakt na ni dál odkazuje přes contacts.account_id, takže se dá vybrat existující nebo založit
-- nová. Na doklad se ale zadává člověk; odběratel se z něj odvodí (jeho firma, jinak on sám).
--
-- Druhá polovina: tým na projektu. Dnes se odvozuje z kontaktů klientovy firmy
-- (projects/[id]/page.tsx), takže statik ani geodet — lidé z jiných firem — k projektu přiřadit
-- nejdou. Od teď je to vazební tabulka projekt ↔ kontakt s rolí.
--
-- Data byla před touhle migrací smazána (byla testovací), takže se nic nepřevádí a sloupce jde
-- rovnou zpřísnit na NOT NULL.

-- ---------------------------------------------------------------------------
-- 1. Kontakt: pryč profese, přibývá adresa
-- ---------------------------------------------------------------------------

-- Profese na člověku sama o sobě neříká nic — role vzniká až tím, čím je na konkrétním projektu.
-- Stěhuje se proto na project_contacts.role_id (číselník 'profese' zůstává).
alter table public.contacts drop column profese_id;

-- Adresa osoby. Bez ní by soukromý klient (nejběžnější případ: člověk stavějící dům) vyšel na
-- dokladu s nadpisem "FAKTURA – DAŇOVÝ DOKLAD" bez adresy — invoicePdf adresu přeskočí, když je
-- null. Názvy sloupců schválně stejné jako u accounts a organizations, aby na ně šel beze změny
-- použít buildAddressQuery (lib/mapbox.ts).
alter table public.contacts
  add column address_street text,
  add column address_house_number text,
  add column address_city text,
  add column address_zip text,
  add column address_country text;

-- ---------------------------------------------------------------------------
-- 2. Projekt, nabídka, faktura: klientem je kontakt
-- ---------------------------------------------------------------------------

alter table public.projects drop column account_id;
alter table public.quotes drop column account_id;
alter table public.invoices drop column account_id;

-- Vazby se zpřísňují na restrict a NOT NULL. Restrict je tu podstatný: kontakt je nově JEDINÁ
-- vazba na zákazníka, takže při 'set null' by smazání kontaktu vystavenou fakturu nesmazalo, ale
-- vytisklo by se na ní "—" místo odběratele. Selhalo by to potichu.
--
-- Omezení se ruší a zakládají znovu (ne přejmenovávají), a vždy s výchozím názvem
-- <tabulka>_<sloupec>_fkey — engine z té konvence skládá vnořené dotazy (exportToExcel.ts),
-- takže odchylka by se projevila až za běhu při exportu nebo tisku.

alter table public.projects
  drop constraint projects_primary_contact_id_fkey,
  alter column primary_contact_id set not null,
  add constraint projects_primary_contact_id_fkey
    foreign key (primary_contact_id) references public.contacts(id) on delete restrict;

alter table public.quotes
  drop constraint quotes_contact_id_fkey,
  alter column contact_id set not null,
  add constraint quotes_contact_id_fkey
    foreign key (contact_id) references public.contacts(id) on delete restrict;

alter table public.invoices
  drop constraint invoices_contact_id_fkey,
  alter column contact_id set not null,
  add constraint invoices_contact_id_fkey
    foreign key (contact_id) references public.contacts(id) on delete restrict;

-- Indexy na referencujících sloupcích. Bez nich prochází kontrola integrity při KAŽDÉM mazání
-- kontaktu celé tři tabulky sekvenčně — restrict nemá co použít. Rušené *_account_id_idx padly
-- se sloupci výš.
create index projects_primary_contact_id_idx on public.projects(primary_contact_id);
create index quotes_contact_id_idx on public.quotes(contact_id);
create index invoices_contact_id_idx on public.invoices(contact_id);

-- ---------------------------------------------------------------------------
-- 3. Tým na projektu
-- ---------------------------------------------------------------------------

-- created_at/updated_at/created_by/modified_by musí existovat DŘÍV, než se připojí generické
-- triggery — ty je nastavují bezpodmínečně. Projekt na tohle už jednou narazil, viz
-- 20260904161500_fix_quote_items_system_fields.sql ("record new has no field created_by").
--
-- owner_id se schválně NEPŘIDÁVÁ: vzorem je quote_items (čistá podřízená tabulka), ne
-- project_milestones. Vlastníka má rodičovský projekt.
create table public.project_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  role_id uuid references public.option_set_values(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  modified_by uuid,
  unique (project_id, contact_id)
);

create index project_contacts_organization_id_idx on public.project_contacts(organization_id);
create index project_contacts_project_id_idx on public.project_contacts(project_id);
create index project_contacts_contact_id_idx on public.project_contacts(contact_id);

-- Generická mašinerie ručně — tři smyčky v init_core_schema.sql už dávno proběhly.
create trigger project_contacts_before_insert before insert on public.project_contacts
  for each row execute function public.trg_set_insert_system_fields();
create trigger project_contacts_before_update before update on public.project_contacts
  for each row execute function public.trg_set_update_system_fields();
create trigger project_contacts_audit after insert or update or delete on public.project_contacts
  for each row execute function public.trg_audit_log();

alter table public.project_contacts enable row level security;
create policy project_contacts_select on public.project_contacts
  for select using (organization_id = public.get_my_organization_id());
create policy project_contacts_insert on public.project_contacts
  for insert with check (organization_id = public.get_my_organization_id());
create policy project_contacts_update on public.project_contacts
  for update using (organization_id = public.get_my_organization_id())
  with check (organization_id = public.get_my_organization_id());
create policy project_contacts_delete on public.project_contacts
  for delete using (organization_id = public.get_my_organization_id());

-- ---------------------------------------------------------------------------
-- 4. qualify_lead: projekt už nemá account_id
-- ---------------------------------------------------------------------------

-- Firmu i kontakt zakládá dál (obojí zůstává), jen projekt na ni neodkazuje — klientem projektu
-- je vytvořený kontakt.
create or replace function public.qualify_lead(p_lead_id uuid, p_create_project boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_account_id uuid;
  v_contact_id uuid;
  v_project_id uuid;
  v_first_name text;
  v_last_name text;
  v_space_pos int;
  v_qualified_reason_id uuid;
  v_name text;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Zájemce nenalezen.';
  end if;

  -- Bez tohohle by security definer funkce (běží s právy vlastníka, ne volajícího) obešla RLS —
  -- tahle kontrola je tu MÍSTO RLS, ne navíc k ní.
  if v_lead.organization_id != public.get_my_organization_id() then
    raise exception 'Nemáš přístup k tomuto zájemci.';
  end if;

  if v_lead.converted_account_id is not null then
    raise exception 'Tento zájemce už byl kvalifikován.';
  end if;

  v_name := trim(v_lead.name);
  v_space_pos := position(' ' in v_name);
  if v_space_pos > 0 then
    v_first_name := substring(v_name from 1 for v_space_pos - 1);
    v_last_name := nullif(substring(v_name from v_space_pos + 1), '');
  else
    v_first_name := v_name;
    v_last_name := null;
  end if;

  insert into public.accounts (organization_id, name, description)
  values (v_lead.organization_id, coalesce(nullif(v_lead.company_name, ''), v_lead.name), v_lead.demand_description)
  returning id into v_account_id;

  insert into public.contacts (organization_id, account_id, first_name, last_name, email, phone)
  values (v_lead.organization_id, v_account_id, v_first_name, v_last_name, v_lead.email, v_lead.phone)
  returning id into v_contact_id;

  if p_create_project then
    insert into public.projects (organization_id, name, primary_contact_id, budget, description)
    values (
      v_lead.organization_id,
      coalesce(nullif(v_lead.company_name, ''), v_lead.name),
      v_contact_id,
      v_lead.expected_value,
      v_lead.demand_description
    )
    returning id into v_project_id;
  end if;

  select ov.id into v_qualified_reason_id
    from public.option_set_values ov
    join public.option_sets os on os.id = ov.option_set_id
    where os.key = 'lead_status_reason' and os.organization_id = v_lead.organization_id and ov.value_key = 'kvalifikovan';

  update public.leads
    set status = 'inactive',
        status_reason_id = v_qualified_reason_id,
        converted_account_id = v_account_id,
        converted_contact_id = v_contact_id,
        converted_project_id = v_project_id
    where id = p_lead_id;

  return jsonb_build_object('accountId', v_account_id, 'contactId', v_contact_id, 'projectId', v_project_id);
end $$;
