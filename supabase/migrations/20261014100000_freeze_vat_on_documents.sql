-- Opravy k 20261002100000_vat_and_document_billing, které našla revize (database-reviewer a
-- silent-failure-hunter):
--
-- 1. Plátcovství se zapisuje na doklad. Dosud ho PDF četlo z aktuálního nastavení firmy, takže
--    přepnutí checkboxu v Nastavení > Fakturace zpětně změnilo nadpis, DPH i částku v QR všech
--    už vystavených faktur.
-- 2. Volba "Vystavit na firmu odběratele" se při založení dokladu už nepřepisuje triggerem.
-- 3. Faktura z nabídky vzniká v jedné transakci — dřív mohla zůstat prázdná faktura se
--    spotřebovaným číslem z řady, když selhalo vložení položek.
-- 4. Sazba DPH ve firmě má rozumný rozsah.

-- ---------------------------------------------------------------------------
-- 1. Plátcovství zmrazené na dokladu
-- ---------------------------------------------------------------------------

alter table public.quotes add column je_platce_dph boolean;
alter table public.invoices add column je_platce_dph boolean;

comment on column public.invoices.je_platce_dph is
  'Plátcovství firmy v okamžiku vystavení. Řídí PDF (nadpis, DPH, datum zdanitelného plnění) — '
  'nikdy se nečte z aktuálního nastavení firmy.';

-- Backfill podle současného nastavení firmy (to se v 20261002100000 odvodilo z DIČ). Doklady
-- neplátce zároveň dostanou sazbu 0 — dosud PDF u neplátce tisklo základ, ale uložené `total`
-- v seznamech a přehledech pořád obsahovalo 21 %, takže aplikace a QR platba ukazovaly dvě různé
-- částky. V době psaní to reálně zasáhlo jen testovací doklady; skutečné doklady neplátců už
-- sazbu 0 měly.
--
-- Uživatelské triggery jsou po dobu backfillu vypnuté: jde o doplnění sloupce, ne o úpravu
-- dokladu, takže se nemá přepsat updated_at/modified_by ani zapsat do audit logu. Součty se
-- proto přepočítávají tady ručně (jinak to dělá *_recalc_on_vat_change).
alter table public.quotes disable trigger user;
alter table public.invoices disable trigger user;

update public.quotes q set je_platce_dph = o.je_platce_dph
  from public.organizations o where o.id = q.organization_id;
update public.invoices i set je_platce_dph = o.je_platce_dph
  from public.organizations o where o.id = i.organization_id;

update public.quotes set vat_rate = 0, vat_amount = 0, total = subtotal
  where not je_platce_dph and vat_rate <> 0;
update public.invoices set vat_rate = 0, vat_amount = 0, total = subtotal
  where not je_platce_dph and vat_rate <> 0;

alter table public.quotes enable trigger user;
alter table public.invoices enable trigger user;

alter table public.quotes alter column je_platce_dph set not null;
alter table public.invoices alter column je_platce_dph set not null;

-- Pojistka: neplátce nesmí mít na dokladu DPH. Trigger níže to zařídí sám, constraint hlídá
-- všechno ostatní (import, MCP, admin klient).
alter table public.quotes add constraint quotes_vat_only_for_payer check (je_platce_dph or vat_rate = 0);
alter table public.invoices add constraint invoices_vat_only_for_payer check (je_platce_dph or vat_rate = 0);

-- Při založení se plátcovství vezme z firmy, potom už se nemění. Neplátci se sazba vynuluje —
-- formulář nabízí výchozí sazbu z nastavení, ale doklad neplátce DPH mít nemůže.
-- Security definer jen kvůli čtení organizations; nic dalšího nečte ani nezapisuje, a doklad
-- s cizím organization_id stejně neprojde RLS insert policy.
create or replace function public.trg_freeze_document_vat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select o.je_platce_dph into new.je_platce_dph
      from public.organizations o where o.id = new.organization_id;
    new.je_platce_dph := coalesce(new.je_platce_dph, false);
  else
    new.je_platce_dph := old.je_platce_dph;
  end if;

  if not new.je_platce_dph then
    new.vat_rate := 0;
  end if;
  return new;
end $$;

-- Název "*_freeze_vat" řadí trigger abecedně PŘED "*_recalc_on_vat_change", takže přepočet
-- součtů už vidí vynulovanou sazbu, a ZA "*_before_insert", který doplní organization_id.
create trigger quotes_freeze_vat before insert or update on public.quotes
  for each row execute function public.trg_freeze_document_vat();
create trigger invoices_freeze_vat before insert or update on public.invoices
  for each row execute function public.trg_freeze_document_vat();

-- ---------------------------------------------------------------------------
-- 2. Odběratel: výchozí hodnota jen když ji nikdo nezvolil
-- ---------------------------------------------------------------------------

-- Bez defaultu, aby trigger poznal "neposláno" (null) od výslovného false. NOT NULL zůstává —
-- kontroluje se až po BEFORE triggerech, které null vždy doplní.
alter table public.quotes alter column odberatel_je_firma drop default;
alter table public.invoices alter column odberatel_je_firma drop default;

-- Security invoker: kontakt se čte pod RLS uživatele, takže trigger o kontaktu cizí firmy nic
-- neprozradí.
create or replace function public.trg_set_odberatel_je_firma()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.odberatel_je_firma is null then
    new.odberatel_je_firma := new.contact_id is not null and exists (
      select 1 from public.contacts c where c.id = new.contact_id and c.account_id is not null
    );
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Faktura z nabídky v jedné transakci
-- ---------------------------------------------------------------------------

-- Security invoker — RLS na quotes/invoices/invoice_items hlídá organizaci stejně jako dřív při
-- dvou samostatných insertech ze server action. `p_item_ids` null = všechny položky.
create or replace function public.generate_invoice_from_quote(p_quote_id uuid, p_item_ids uuid[] default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_quote public.quotes%rowtype;
  v_org_payer boolean;
  v_org_rate numeric;
  v_vat_rate numeric;
  v_invoice_id uuid;
  v_found int;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Nabídka nenalezena.' using errcode = 'P0002';
  end if;

  -- Prázdný výběr by vytvořil prázdnou fakturu se spotřebovaným číslem z řady.
  if p_item_ids is not null and cardinality(p_item_ids) = 0 then
    raise exception 'Vyberte alespoň jednu položku k fakturaci.' using errcode = 'P0002';
  end if;

  -- Položka smazaná mezitím v jiném okně by jinak tiše vypadla a faktura by vznikla bez ní.
  if p_item_ids is not null then
    select count(*) into v_found from public.quote_items
      where quote_id = p_quote_id and id = any(p_item_ids);
    if v_found <> cardinality(array(select distinct unnest(p_item_ids))) then
      raise exception 'Některé vybrané položky už v nabídce nejsou. Obnovte stránku a vyberte je znovu.'
        using errcode = 'P0002';
    end if;
  end if;

  -- Sazba z nabídky platí, jen když se plátcovství od jejího vystavení nezměnilo. Nabídka
  -- neplátce (0 %) by jinak u mezitím plátcovské firmy dala daňový doklad s nulovou DPH; opačný
  -- směr vynuluje trigger *_freeze_vat sám.
  select o.je_platce_dph, o.default_vat_rate into v_org_payer, v_org_rate
    from public.organizations o where o.id = v_quote.organization_id;
  v_vat_rate := case when v_quote.je_platce_dph = coalesce(v_org_payer, false)
                     then v_quote.vat_rate else v_org_rate end;

  insert into public.invoices (name, quote_id, project_id, contact_id, odberatel_je_firma, vat_rate, note)
    values (v_quote.name, p_quote_id, v_quote.project_id, v_quote.contact_id,
            v_quote.odberatel_je_firma, v_vat_rate, v_quote.note)
    returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, name, quantity, unit, unit_price, sort_order)
    select v_invoice_id, qi.name, qi.quantity, qi.unit, qi.unit_price, qi.sort_order
      from public.quote_items qi
      where qi.quote_id = p_quote_id and (p_item_ids is null or qi.id = any(p_item_ids))
      order by qi.sort_order;

  return v_invoice_id;
end $$;

revoke execute on function public.generate_invoice_from_quote(uuid, uuid[]) from public, anon;
grant execute on function public.generate_invoice_from_quote(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rozsah výchozí sazby DPH
-- ---------------------------------------------------------------------------

alter table public.organizations
  add constraint organizations_default_vat_rate_range check (default_vat_rate between 0 and 100);
