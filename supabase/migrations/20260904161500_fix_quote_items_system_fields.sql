-- quote_items dostal generické triggery trg_set_insert_system_fields / trg_set_update_system_fields
-- (20260904160000), ale chyběly mu sloupce created_by/modified_by, které tyhle triggery
-- bezpodmínečně nastavují — insert selhal s "record \"new\" has no field \"created_by\"".
alter table public.quote_items
  add column created_by uuid,
  add column modified_by uuid;
