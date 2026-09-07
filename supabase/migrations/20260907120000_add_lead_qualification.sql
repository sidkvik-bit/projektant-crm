-- Kvalifikace Zájemce -> Obchodní vztah + Kontakt (volitelně i Projekt). Celé v jedné funkci,
-- ne z více samostatných insertů z TS — vytváří 2-3 řádky a upravuje čtvrtý, takže to musí být
-- atomické (stejný důvod jako u triggerů na součty Nabídek/Faktur).

alter table public.leads
  add column converted_account_id uuid references public.accounts(id) on delete set null,
  add column converted_contact_id uuid references public.contacts(id) on delete set null,
  add column converted_project_id uuid references public.projects(id) on delete set null;

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
    insert into public.projects (organization_id, name, account_id, primary_contact_id, budget, description)
    values (
      v_lead.organization_id,
      coalesce(nullif(v_lead.company_name, ''), v_lead.name),
      v_account_id,
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

grant execute on function public.qualify_lead(uuid, boolean) to authenticated;
