-- Oprava: organizacím založeným po 13. 9. 2026 chybí čtyři číselníky.
--
-- Co se stalo: 20260913220000_add_status_reason_scoping.sql přepsalo seed_default_option_sets
-- celou (osmá kopie té funkce v repozitáři) a při tom z ní vypadly bloky quote_status_reason,
-- pravni_forma, forma_uhrady a invoice_status_reason. Starší organizace mají 18 číselníků,
-- novější 14 — prakticky jim chybí právní forma u firmy, formy úhrady a důvody stavu u dokladů.
--
-- Zároveň tatáž migrace zrušila v seed_active_inactive_reason OBĚ on conflict klauzule, takže
-- funkce přestala být idempotentní a obvyklý backfill (smyčka přes organizace) padal na 23505.
-- Bez toho by nešlo chybějící číselníky doplnit.
--
-- Aby se to neopakovalo: čtyři obchodní číselníky dostávají vlastní funkci, kterou
-- seed_default_option_sets jen zavolá. Příští migrace, která bude přidávat číselník, tak nemusí
-- přepisovat celé to dlouhé tělo a nemá jak z něj něco vynechat.

-- 1) Vrátit idempotenci. U hodnot navíc doplnit status_scope — sloupec vznikl až v 20260913220000,
--    takže řádky starších organizací ho mají prázdný a samotné "do nothing" by je neopravilo.
create or replace function public.seed_active_inactive_reason(p_org_id uuid, p_key text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
  insert into option_sets (organization_id, key, label) values (p_org_id, p_key, p_label)
    on conflict (organization_id, key) do update set label = excluded.label returning id into v_set_id;
  insert into option_set_values (option_set_id, organization_id, value_key, label, sort_order, is_default, status_scope) values
    (v_set_id, p_org_id, 'aktivni', 'Aktivní', 1, true, 'active'),
    (v_set_id, p_org_id, 'neaktivni', 'Neaktivní', 2, false, 'inactive')
  on conflict (option_set_id, value_key) do update set status_scope = excluded.status_scope;
end $$;

-- 2) Chybějící čtyři číselníky ve vlastní funkci.
create or replace function public.seed_commerce_option_sets(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_set_id uuid;
begin
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
end $$;

-- 3) seed_default_option_sets: beze změny obsahu, jen na konci volá novou funkci.
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
  perform public.seed_commerce_option_sets(p_org_id);
end $$;

-- 4) Doplnit chybějící číselníky všem existujícím organizacím. Teď už to projde opakovaně.
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_default_option_sets(r.id);
  end loop;
end $$;
