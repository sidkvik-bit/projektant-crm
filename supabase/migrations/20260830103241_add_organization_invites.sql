-- Pozvánky do organizace — autorizace je vždy proti ověřenému e-mailu z Google OAuth
-- (auth.users.email), ne proti hodnotě zadané klientem. Bez "poslání odkazu" —
-- to zatím neřešíme, jen datový model + join-by-email flow.

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index organization_invites_organization_id_idx on public.organization_invites(organization_id);
create index organization_invites_email_idx on public.organization_invites(email);

create or replace function public.trg_normalize_invite_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.invited_by := auth.uid();
  return new;
end $$;

create trigger organization_invites_before_insert
  before insert on public.organization_invites
  for each row execute function public.trg_normalize_invite_email();

alter table public.organization_invites enable row level security;

-- Členové organizace vidí/spravují pozvánky své firmy (pro budoucí "Pozvat kolegu" UI).
create policy organization_invites_select_own_org on public.organization_invites
  for select using (organization_id = public.get_my_organization_id());

create policy organization_invites_insert_own_org on public.organization_invites
  for insert with check (organization_id = public.get_my_organization_id());

create policy organization_invites_delete_own_org on public.organization_invites
  for delete using (organization_id = public.get_my_organization_id());

-- Nová (zatím orgless) osoba smí vidět JEN pozvánky adresované jejímu vlastnímu
-- ověřenému e-mailu — nutné pro onboarding "vyber si firmu, ke které se připojíš".
create policy organization_invites_select_own_email on public.organization_invites
  for select using (email = lower((auth.jwt() ->> 'email')));
