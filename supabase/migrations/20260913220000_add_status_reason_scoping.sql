-- Skutečné D365 chování: "Důvod stavu" patří ke konkrétnímu stavu (Aktivní/Neaktivní), takže
-- combobox nabízí jen důvody platné pro aktuální stav záznamu — ne aby šlo vybrat "Neaktivní"
-- jako důvod u záznamu, co je pořád "Aktivní" (přesně tenhle matoucí kombo nahlásil uživatel).
--
-- Scoping se přidává jen tam, kde je jednoznačný: generické Aktivní/Neaktivní důvody (Account/
-- Contact/Activity/Bug/ProjectTemplate/TemplateMilestone/ProjectMilestone/NotificationConfig,
-- přes sdílený seed_active_inactive_reason) a Lead (Nový/Kontaktován = aktivní,
-- Kvalifikován/Diskvalifikován = neaktivní — přesně odpovídá qualify_lead()). Project/Quote/
-- Invoice mají svoje důvody jako nezávislý pracovní postup (Koncept/Vystavena/Uhrazena…), ne
-- jako podkategorii aktivní/neaktivní stavu, takže se schválně NEscopují — hádat by tam mohlo
-- zablokovat reálně používanou kombinaci.

alter table public.option_set_values
  add column status_scope text check (status_scope in ('active', 'inactive'));

create or replace function public.seed_active_inactive_reason(p_org_id uuid, p_key text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  insert into option_sets (organization_id, key, label) values (p_org_id, p_key, p_label) returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default, status_scope) values
    (v_set_id, p_org_id, 'aktivni', 'Aktivní', 1, true, 'active'),
    (v_set_id, p_org_id, 'neaktivni', 'Neaktivní', 2, false, 'inactive');
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
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default, status_scope) values
    (v_set_id, p_org_id, 'novy', 'Nový', 1, true, 'active'),
    (v_set_id, p_org_id, 'kontaktovan', 'Kontaktován', 2, false, 'active'),
    (v_set_id, p_org_id, 'kvalifikovan', 'Kvalifikován', 3, false, 'inactive'),
    (v_set_id, p_org_id, 'diskvalifikovan', 'Diskvalifikován', 4, false, 'inactive')
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

  perform public.seed_active_inactive_reason(p_org_id, 'account_status_reason', 'Důvod stavu - Firma');
  perform public.seed_active_inactive_reason(p_org_id, 'contact_status_reason', 'Důvod stavu - Kontakt');
  perform public.seed_active_inactive_reason(p_org_id, 'project_template_status_reason', 'Důvod stavu - Šablona projektu');
  perform public.seed_active_inactive_reason(p_org_id, 'template_milestone_status_reason', 'Důvod stavu - Krok šablony');
  perform public.seed_active_inactive_reason(p_org_id, 'project_milestone_status_reason', 'Důvod stavu - Milník');
  perform public.seed_active_inactive_reason(p_org_id, 'activity_status_reason', 'Důvod stavu - Aktivita');
  perform public.seed_active_inactive_reason(p_org_id, 'notification_config_status_reason', 'Důvod stavu - Konfigurace notifikace');
  perform public.seed_active_inactive_reason(p_org_id, 'bug_status_reason', 'Důvod stavu - Bug');
end $$;

-- Backfill existujících organizací — 'aktivni'/'neaktivni' value_key se používá výhradně
-- v těch generických číselnících výše, takže bezpečně globálně bez filtrování podle option_set.
update public.option_set_values set status_scope = 'active' where value_key = 'aktivni';
update public.option_set_values set status_scope = 'inactive' where value_key = 'neaktivni';

update public.option_set_values ov
  set status_scope = case ov.value_key when 'novy' then 'active' when 'kontaktovan' then 'active'
    when 'kvalifikovan' then 'inactive' when 'diskvalifikovan' then 'inactive' end
  from public.option_sets os
  where ov.option_set_id = os.id and os.key = 'lead_status_reason'
    and ov.value_key in ('novy', 'kontaktovan', 'kvalifikovan', 'diskvalifikovan');
