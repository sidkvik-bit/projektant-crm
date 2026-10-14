-- Plátcovství DPH jako nastavení firmy, a volba odběratele na dokladu.
--
-- Druhá dávka připomínek od projektanta. Tři z nich (datum zdanitelného plnění, nadpis
-- "daňový doklad", sazba DPH) jsou ve skutečnosti jedna otázka: jestli je firma plátce DPH.
-- Proto jeden přepínač, který řídí chování, a ne tři samostatná zaškrtávátka.

-- ---------------------------------------------------------------------------
-- 1. DPH v nastavení firmy
-- ---------------------------------------------------------------------------

-- Záměrně samostatný sloupec, ne odvození z DIČ: identifikovaná osoba DIČ má a plátce DPH
-- přitom není, takže odvozování by u reálného případu lhalo.
alter table public.organizations
  add column je_platce_dph boolean not null default false,
  add column default_vat_rate numeric(5, 2) not null default 21;

comment on column public.organizations.je_platce_dph is
  'Řídí sazbu DPH na dokladech, datum zdanitelného plnění i nadpis PDF. Neodvozovat z DIČ.';

-- Backfill: dosud se DPH tisklo vždy, takže plátcem byl fakticky každý, kdo má DIČ.
update public.organizations set je_platce_dph = true where coalesce(dic, '') <> '';

-- ---------------------------------------------------------------------------
-- 2. Mrtvé předčíslí faktury
-- ---------------------------------------------------------------------------

-- Od 20260925150000 má číslo faktury tvar rok+měsíc+pořadí a předčíslí se nikam nedostane;
-- trigger ho už ani nenačítá. Sloupec jen mate (a pole v nastavení z UI zmizelo tamtéž).
alter table public.organizations drop column invoice_number_prefix;

-- ---------------------------------------------------------------------------
-- 3. Odběratel: osoba, nebo firma kontaktu
-- ---------------------------------------------------------------------------

-- Klient je kontakt (viz 20260925130000) a tím to zůstává — tohle není vazba na firmu navíc,
-- jen volba, čí údaje se na doklad vytisknou. Dosud to bylo napevno "firma kontaktu, když
-- ji má", což nepokrylo případ, kdy si zaměstnanec firmy objedná projekt soukromě.
alter table public.quotes add column odberatel_je_firma boolean not null default false;
alter table public.invoices add column odberatel_je_firma boolean not null default false;

comment on column public.invoices.odberatel_je_firma is
  'true = doklad se vystaví na firmu kontaktu, false = na kontakt samotný.';

-- Výchozí hodnota kopíruje dosavadní chování: firma, pokud ji kontakt má.
create or replace function public.trg_set_odberatel_je_firma()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    new.odberatel_je_firma := exists (
      select 1 from public.contacts c where c.id = new.contact_id and c.account_id is not null
    );
  end if;
  return new;
end $$;

-- Jen BEFORE INSERT — při editaci už rozhoduje uživatel, přepsat mu to zpátky by bylo horší
-- než ta původní napevno zadaná logika.
create trigger quotes_set_odberatel before insert on public.quotes
  for each row execute function public.trg_set_odberatel_je_firma();
create trigger invoices_set_odberatel before insert on public.invoices
  for each row execute function public.trg_set_odberatel_je_firma();

update public.quotes q set odberatel_je_firma = true
  from public.contacts c where c.id = q.contact_id and c.account_id is not null;
update public.invoices i set odberatel_je_firma = true
  from public.contacts c where c.id = i.contact_id and c.account_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Formy úhrady bez karty
-- ---------------------------------------------------------------------------

-- Projektant inkasuje hotově nebo převodem; karta je položka navíc, kterou nikdy nepoužije.
-- Maže se jen tam, kde na ni nevisí faktura — jinak by to spadlo na cizí klíč a historický
-- doklad by stejně měl zůstat čitelný.
delete from public.option_set_values v
  using public.option_sets s
  where v.option_set_id = s.id
    and s.key = 'forma_uhrady'
    and v.value_key = 'kartou'
    and not exists (select 1 from public.invoices i where i.forma_uhrady_id = v.id);

-- A ať ji nedostanou ani nově zakládané organizace: seed se liší jen o ten jeden řádek,
-- ale PL/pgSQL funkci nejde opravit po částech, takže se nahrazuje celá.
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
    (v_set_id, p_org_id, 'hotove', 'Hotově', 2, false)
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
