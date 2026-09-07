-- Vlastní logo organizace — nahrává se v Nastavení -> Fakturace (ImageUpload, stejný vzor jako
-- Bug.image_url), tiskne se na PDF Nabídky i Faktury. Veřejně čitelný bucket (jako screenshoty
-- bugů) — zjednodušení, žádné signed URLs; zápis/mazání jen pro přihlášené uživatele.
alter table public.organizations add column logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-logos', 'organization-logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy organization_logos_read on storage.objects
  for select using (bucket_id = 'organization-logos');

create policy organization_logos_insert on storage.objects
  for insert with check (bucket_id = 'organization-logos' and auth.role() = 'authenticated');

create policy organization_logos_delete on storage.objects
  for delete using (bucket_id = 'organization-logos' and auth.role() = 'authenticated');
