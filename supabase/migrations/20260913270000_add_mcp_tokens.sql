-- Osobní tokeny pro MCP server (/api/mcp) — uživatel si ho vygeneruje v Nastavení a vloží do
-- svého AI klienta (Claude, Cursor…). Token sám o sobě NENÍ přístup do databáze: mapuje se na
-- uložený refresh_token, ze kterého si server při každém volání vymění čerstvý access token a
-- teprve pod ním se ptá databáze. Všechny dotazy tedy běží pod identitou toho uživatele a
-- platí na ně úplně stejná RLS pravidla jako ve webové appce — server nikdy nesahá na data
-- přes service_role.
--
-- Ukládá se jen HASH tokenu (plain text vidí uživatel jednou při vygenerování). Řádek obsahuje
-- přihlašovací údaj, takže stejně jako google_drive_tokens nemá ŽÁDNOU klientskou RLS policy —
-- čte a zapisuje výhradně server přes service_role.

create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index mcp_tokens_user_id_idx on public.mcp_tokens(user_id);

alter table public.mcp_tokens enable row level security;
-- Žádné policy = žádný přístup pro anon/authenticated; service_role RLS obchází.
