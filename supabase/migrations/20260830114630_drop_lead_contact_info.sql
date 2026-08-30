-- Nahrazeno oddělenými email/phone poli (Fáze D365 rozšíření).
alter table public.leads drop column contact_info;
