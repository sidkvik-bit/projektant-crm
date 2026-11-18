-- Stabilní přihlášení MCP konektoru (Claude) — konec opakovaného „přihlas se znovu“.
--
-- Příčiny, které tahle migrace (spolu s kódem v src/lib/mcp/) odstraňuje:
--
-- 1. Konektor si při povolení bral Supabase relaci z PROHLÍŽEČE. Prohlížeč i konektor pak
--    rotovaly tentýž refresh token; kdo přišel druhý se starým, toho Supabase vyhodnotil jako
--    zneužití a zrušil celou relaci (konektor i web). Kód teď konektoru zakládá vlastní relaci.
--
-- 2. OAuth refresh vytvářel nový řádek a kopíroval do něj Supabase refresh token. Teď se rotuje
--    na místě — jedno připojení = jeden řádek = jedna kopie Supabase tokenu, která nezastará.
--    previous_refresh_hash + rotated_at dovolí krátkou toleranci, když klient obnovu zopakuje
--    (ztracená odpověď, dvě obnovy souběžně) — dřív to znamenalo okamžité odhlášení.
--
-- 3. Supabase relace se obnovovala při KAŽDÉM volání nástroje. Teď se access token Supabase
--    drží v řádku do vypršení, takže obnov (a souběhů mezi nimi) je o řády méně.
--
-- Tabulka nemá žádnou klientskou RLS policy (čte ji jen server přes service_role), nové sloupce
-- tedy nikam neprosáknou. Nic se nemaže; staré řádky fungují dál, jen bez vlastní relace —
-- po jednom novém připojení konektoru se to srovná.

alter table public.mcp_tokens
  add column if not exists previous_refresh_hash text,
  add column if not exists rotated_at timestamptz,
  add column if not exists supabase_access_token text,
  add column if not exists supabase_access_expires_at timestamptz;

create index if not exists mcp_tokens_previous_refresh_hash_idx
  on public.mcp_tokens(previous_refresh_hash)
  where previous_refresh_hash is not null;
