-- Kontakt může existovat i bez navázané firmy (D365-style: Account je jen
-- jeden z možných obchodních vztahů, ne povinná vazba). Zároveň smazání
-- firmy nesmí smazat kontakty, jen je odpojit.
alter table public.contacts
  drop constraint contacts_account_id_fkey,
  alter column account_id drop not null,
  add constraint contacts_account_id_fkey
    foreign key (account_id) references public.accounts(id) on delete set null;
