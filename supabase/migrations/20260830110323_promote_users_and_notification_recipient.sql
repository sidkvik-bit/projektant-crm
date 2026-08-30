-- Povyšuje user_preferences na plnohodnotnou "users" tabulku (jméno, příjmení,
-- e-mail, avatar — naplní se z Google profilu při prvním loginu), a přidává
-- povinného příjemce na Notifications_Config, aby šlo mailem/zvonečkem cílit
-- na konkrétního člověka místo broadcastu na celou firmu.

alter table public.user_preferences rename to users;

alter table public.users
  add column first_name text,
  add column last_name text,
  add column email text,
  add column avatar_url text;

create or replace function public.get_my_organization_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.users where user_id = auth.uid();
$$;

alter table public.notifications_config
  add column recipient_user_id uuid not null references public.users(user_id);
