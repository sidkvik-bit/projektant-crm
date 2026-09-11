-- Defense-in-depth: běžný (ne service_role) klient smí vložit vlastní
-- user_preferences jen do organizace, kde na jeho ověřený e-mail existuje
-- pozvánka. Založení NOVÉ organizace jde výhradně přes service_role
-- (onboarding actions.ts), který RLS obchází, takže tahle policy mu nepřekáží.

drop policy user_preferences_insert_own on public.user_preferences;

create policy user_preferences_insert_own on public.user_preferences
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organization_invites
      where organization_invites.organization_id = user_preferences.organization_id
        and organization_invites.email = lower(auth.jwt() ->> 'email')
    )
  );
