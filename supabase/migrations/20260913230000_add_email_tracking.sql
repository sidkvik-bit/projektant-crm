-- E-mail tracking: dedikovaná Gmail schránka (nastavená mimo appku přes Workspace BCC
-- routing pravidlo, viz /settings/email) se pravidelně synchronizuje a příchozí zprávy se
-- spárují podle e-mailové adresy na Account/Contact/Lead — jen shody, žádný nematchnutý
-- e-mail se nikam nezapisuje. Refresh token je citlivý jako přihlašovací údaj — stejný vzor
-- jako google_drive_tokens: RLS bez jakékoliv policy, čte/zapisuje výhradně service_role.

create table public.email_sync_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  mailbox_email text not null,
  refresh_token text not null,
  last_history_id text,
  last_synced_at timestamptz,
  connected_by uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_sync_connections enable row level security;
-- Žádné policy = žádný přístup pro anon/authenticated; service_role RLS obchází.

-- Dedupe klíč pro opakované běhy cronu: jeden Gmail message může spárovat víc záznamů
-- (např. e-mail kontaktu i jeho firmy zároveň), takže index je na dvojici zpráva+záznam,
-- ne jen na zprávu — jinak by druhý match ke stejné zprávě nešel zapsat.
alter table public.activities add column gmail_message_id text;
create unique index activities_gmail_message_id_entity_key
  on public.activities (organization_id, gmail_message_id, entity_type, entity_id)
  where gmail_message_id is not null;

-- Pro pravidelné volání /api/cron/email-sync po pár minutách — Vercel Cron na Hobby
-- plánu umí jen 1x/den, takže plán běží odsud (pg_cron -> pg_net -> HTTPS). Samotné
-- `cron.schedule(...)` volání se schválně NEPŘIDÁVÁ do migrace (potřebuje nasazenou
-- URL appky a CRON_SECRET, který nepatří do gitu) — jednorázový SQL skript je
-- v návodu na /settings/email, spouští se ručně přes Supabase SQL editor.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
