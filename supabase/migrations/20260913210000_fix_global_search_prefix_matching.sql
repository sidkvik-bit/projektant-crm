-- global_search používal websearch_to_tsquery, což dělá přesné shody CELÝCH slov ("te" nenajde
-- "Test", "RD D" nenajde "RD Domácnost" dokud "D" není samostatné slovo někde v datech) — pro
-- search-as-you-type v top baru je potřeba prefix matching (Postgres `slovo:*` syntaxe).
--
-- Dotaz se skládá ručně z jednotlivých slov (rozdělených podle mezer), z každého se ořežou
-- znaky, co nejsou písmeno/číslice (safe proti tsquery syntax injection — uživatelský vstup by
-- jinak mohl obsahovat &/|/!/() a rozbít nebo přeznačit dotaz), a připojí se `:*`. Prázdný/čistě
-- speciální vstup -> `parsed.query` je null -> `@@ null` je null (falsy) -> žádný match, žádná chyba.

create or replace function public.global_search(q text, result_limit int default 30)
returns table (
  entity text,
  id uuid,
  title text,
  subtitle text,
  rank real
)
language sql stable as $$
  with parsed as (
    select to_tsquery('simple', string_agg(word || ':*', ' & ')) as query
    from (
      select regexp_replace(lexeme, '[^[:alnum:]]', '', 'g') as word
      from regexp_split_to_table(trim(q), '\s+') as lexeme
    ) words
    where word <> ''
  )
  select * from (
    select 'Lead' as entity, l.id, l.name as title, coalesce(l.company_name, '') as subtitle,
      ts_rank(l.search_vector, parsed.query) as rank
    from public.leads l, parsed
    where l.search_vector @@ parsed.query

    union all
    select 'Account', a.id, a.name, coalesce(a.ico, ''),
      ts_rank(a.search_vector, parsed.query)
    from public.accounts a, parsed
    where a.search_vector @@ parsed.query

    union all
    select 'Contact', c.id, trim(c.first_name || ' ' || coalesce(c.last_name, '')), coalesce(c.email, ''),
      ts_rank(c.search_vector, parsed.query)
    from public.contacts c, parsed
    where c.search_vector @@ parsed.query

    union all
    select 'Project', p.id, p.name, coalesce(p.address_city, ''),
      ts_rank(p.search_vector, parsed.query)
    from public.projects p, parsed
    where p.search_vector @@ parsed.query

    union all
    select 'Quote', qt.id, qt.name, qt.number,
      ts_rank(qt.search_vector, parsed.query)
    from public.quotes qt, parsed
    where qt.search_vector @@ parsed.query

    union all
    select 'Invoice', i.id, i.name, i.number,
      ts_rank(i.search_vector, parsed.query)
    from public.invoices i, parsed
    where i.search_vector @@ parsed.query

    union all
    select 'Activity', act.id, act.subject, coalesce(act.description, ''),
      ts_rank(act.search_vector, parsed.query)
    from public.activities act, parsed
    where act.search_vector @@ parsed.query
  ) combined
  order by rank desc
  limit result_limit
$$;
