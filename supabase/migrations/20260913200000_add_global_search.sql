-- Globální fulltextový search přes celou appku (top bar). Postgres tsvector/GIN místo ILIKE —
-- 'simple' konfigurace záměrně: Postgres nemá vestavěný český textový search config (jen
-- english/german/... dictionaries), takže 'simple' (jen tokenizace + lowercase, bez stemmingu)
-- je tu čestná volba, ne zkratka — pro jména/firmy/čísla je navíc predictable chování žádoucí.
--
-- Obyčejná (ne security definer) SQL funkce -> běží s právy volajícího, takže RLS na každé
-- tabulce uvnitř platí přesně stejně, jako by ten select spustil uživatel sám -- žádné ruční
-- filtrování podle organization_id navíc, stejně jako všude jinde v appce.

alter table public.leads
  add column search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(company_name, '') || ' ' ||
      coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(demand_description, '')
    )
  ) stored;
create index leads_search_idx on public.leads using gin(search_vector);

alter table public.accounts
  add column search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(ico, '') || ' ' || coalesce(phone, '') || ' ' ||
      coalesce(email, '') || ' ' || coalesce(website, '') || ' ' || coalesce(industry, '') || ' ' ||
      coalesce(address_city, '')
    )
  ) stored;
create index accounts_search_idx on public.accounts using gin(search_vector);

alter table public.contacts
  add column search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(mobile_phone, '')
    )
  ) stored;
create index contacts_search_idx on public.contacts using gin(search_vector);

alter table public.projects
  add column search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(address_city, '') || ' ' ||
      coalesce(katastralni_uzemi, '') || ' ' || coalesce(parcelni_cislo, '')
    )
  ) stored;
create index projects_search_idx on public.projects using gin(search_vector);

alter table public.quotes
  add column search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(number, '') || ' ' || coalesce(note, ''))
  ) stored;
create index quotes_search_idx on public.quotes using gin(search_vector);

alter table public.invoices
  add column search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(number, '') || ' ' ||
      coalesce(variabilni_symbol, '') || ' ' || coalesce(note, '')
    )
  ) stored;
create index invoices_search_idx on public.invoices using gin(search_vector);

alter table public.activities
  add column search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(description, ''))
  ) stored;
create index activities_search_idx on public.activities using gin(search_vector);

create or replace function public.global_search(q text, result_limit int default 30)
returns table (
  entity text,
  id uuid,
  title text,
  subtitle text,
  rank real
)
language sql stable as $$
  select * from (
    select 'Lead' as entity, l.id, l.name as title, coalesce(l.company_name, '') as subtitle,
      ts_rank(l.search_vector, websearch_to_tsquery('simple', q)) as rank
    from public.leads l
    where l.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Account', a.id, a.name, coalesce(a.ico, ''),
      ts_rank(a.search_vector, websearch_to_tsquery('simple', q))
    from public.accounts a
    where a.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Contact', c.id, trim(c.first_name || ' ' || coalesce(c.last_name, '')), coalesce(c.email, ''),
      ts_rank(c.search_vector, websearch_to_tsquery('simple', q))
    from public.contacts c
    where c.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Project', p.id, p.name, coalesce(p.address_city, ''),
      ts_rank(p.search_vector, websearch_to_tsquery('simple', q))
    from public.projects p
    where p.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Quote', qt.id, qt.name, qt.number,
      ts_rank(qt.search_vector, websearch_to_tsquery('simple', q))
    from public.quotes qt
    where qt.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Invoice', i.id, i.name, i.number,
      ts_rank(i.search_vector, websearch_to_tsquery('simple', q))
    from public.invoices i
    where i.search_vector @@ websearch_to_tsquery('simple', q)

    union all
    select 'Activity', act.id, act.subject, coalesce(act.description, ''),
      ts_rank(act.search_vector, websearch_to_tsquery('simple', q))
    from public.activities act
    where act.search_vector @@ websearch_to_tsquery('simple', q)
  ) combined
  order by rank desc
  limit result_limit
$$;

grant execute on function public.global_search(text, int) to authenticated;
