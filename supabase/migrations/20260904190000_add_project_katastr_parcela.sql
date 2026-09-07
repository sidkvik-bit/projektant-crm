-- Katastrální území + parcelní číslo — opakovaně vyžadované u žádostí o vyjádření k
-- existenci sítí (ČEZ Distribuce, NET4GAS, CETIN, ...), ne jednorázová specialita
-- jednoho formuláře, takže patří natrvalo na Projekt vedle zbytku adresy/umístění.
alter table public.projects
  add column katastralni_uzemi text,
  add column parcelni_cislo text;
