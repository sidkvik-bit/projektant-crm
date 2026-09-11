-- Orgless uživatel (ještě žádný user_preferences) potřebuje vidět alespoň
-- jméno organizace, do které je pozvaný — jinak se PostgREST embed
-- organization_invites -> organizations vrátí jako null kvůli RLS.

create policy organizations_select_via_invite on public.organizations
  for select using (
    exists (
      select 1 from public.organization_invites
      where organization_invites.organization_id = organizations.id
        and organization_invites.email = lower(auth.jwt() ->> 'email')
    )
  );
