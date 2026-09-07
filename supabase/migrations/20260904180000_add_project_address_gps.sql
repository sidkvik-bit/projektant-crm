-- Adresa místa realizace projektu (jiná věc než fakturační adresa klienta na Account) +
-- GPS dopočítané z ní přes Mapbox geocoding (src/lib/mapbox.ts), případně ručně opravené
-- z mapy (viz ProjectLocationMap.tsx). gps_lat/gps_lng nejsou ve formuláři editovatelné
-- přímo jako čísla — jen přes geokódování nebo výběr bodu na mapě.
alter table public.projects
  add column address_street text,
  add column address_house_number text,
  add column address_city text,
  add column address_zip text,
  add column address_country text,
  add column gps_lat numeric(9, 6),
  add column gps_lng numeric(9, 6);
