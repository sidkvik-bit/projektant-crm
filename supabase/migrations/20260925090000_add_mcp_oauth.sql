-- OAuth 2.1 autorizační server pro MCP (/api/mcp).
--
-- Proč vůbec: claude.ai na webu neumí poslat statický token v hlavičce (políčko na něj většina
-- účtů nemá), umí jen OAuth. Osobní `pcrm_` tokeny zůstávají beze změny pro klienty s konfigurákem
-- (Claude Desktop, Cursor) — tohle je druhá vstupní branka ke stejným datům, ne náhrada.
--
-- Návrh stojí na tom, že vydaný OAuth access token je zase jen řádek v mcp_tokens: nese stejný
-- Supabase refresh_token uživatele, takže resolveMcpSession() i celá vrstva nástrojů zůstávají
-- nedotčené a všechno dál běží pod identitou uživatele s platnou RLS.
--
-- Obě nové tabulky drží přihlašovací údaje, takže stejně jako mcp_tokens nemají ŽÁDNOU klientskou
-- RLS policy — sahá na ně výhradně server přes service_role.

-- Klient, kterému uživatel povolil přístup. Buď CIMD (client_id je https URL, na které si sami
-- stáhneme metadata), nebo dynamicky registrovaný podle RFC 7591.
create table public.oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  is_cimd boolean not null default false,
  metadata_refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Autorizační kód je jednorázová, krátkodobá směnka na token. Drží i Supabase refresh_token
-- uživatele — ten se sem dostane z jeho přihlášené relace ve chvíli, kdy klikne na "Povolit".
create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(user_id) on delete cascade,
  redirect_uri text not null,
  -- PKCE: ukládá se jen challenge, verifier klient prokáže až při výměně za token.
  code_challenge text not null,
  supabase_refresh_token text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_authorization_codes_expires_at_idx on public.oauth_authorization_codes(expires_at);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;

-- Rozšíření mcp_tokens o to, co potřebuje OAuth. U ručně vygenerovaných tokenů zůstávají null:
-- ty nepatří žádnému klientovi a záměrně neexpirují.
alter table public.mcp_tokens
  add column client_id text references public.oauth_clients(client_id) on delete cascade,
  -- Claude si token cachuje jen když expires_in vyjde mezi 5 minutami a dnem; bez expirace by
  -- si ho vyměňoval při každém requestu.
  add column expires_at timestamptz,
  add column oauth_refresh_hash text;

-- OAuth 2.1 vyžaduje u veřejných klientů rotaci refresh tokenů, takže při každém obnovení
-- vzniká nový řádek a starý se odvolá. Unikátnost tedy hlídáme jen na živých hodnotách.
create unique index mcp_tokens_oauth_refresh_hash_key
  on public.mcp_tokens(oauth_refresh_hash)
  where oauth_refresh_hash is not null;

-- Úklid propadlých kódů: jsou jednorázové a žijí minuty, není důvod je držet.
create or replace function public.purge_expired_oauth_codes()
returns void language sql security definer set search_path = public as $$
  delete from public.oauth_authorization_codes where expires_at < now() - interval '1 day';
$$;
