-- Per-user Google Drive refresh tokeny — umožní CRM zrcadlit obsah Drive složky
-- projektu (read-only), ale vždy jen v rozsahu toho, co reálně vidí přihlášený
-- uživatel ve SVÉM Google účtu (ne sdílený service account s trvalým přístupem
-- ke všemu). Token je citlivý jako přihlašovací údaj — RLS proto nemá ŽÁDNOU
-- policy pro `authenticated`, čte/zapisuje ho výhradně server přes service_role
-- (viz src/app/auth/callback/route.ts a src/lib/googleDrive.ts).

create table public.google_drive_tokens (
  user_id uuid primary key references public.users(user_id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_tokens enable row level security;
-- Žádné policy = žádný přístup pro anon/authenticated role; service_role RLS obchází.
