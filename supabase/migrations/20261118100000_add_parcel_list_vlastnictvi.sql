-- Číslo listu vlastnictví (LV) u parcely projektu.
--
-- Proč u parcely a ne u projektu: stavba často stojí na několika parcelách a každá může
-- patřit na jiný LV (jiný vlastník, obecní cesta, sousedův pruh pro přípojku). Do jednoho pole
-- u projektu by se to zase psalo dohromady — stejná chyba, kterou project_parcels opravily.
--
-- Text, ne číslo: LV se uvádí i s předponou nebo jako „LV 1234“ a nikdy se s ním nepočítá.

alter table public.project_parcels
  add column if not exists list_vlastnictvi text;

comment on column public.project_parcels.list_vlastnictvi is
  'Číslo listu vlastnictví (LV), na kterém je parcela zapsaná v katastru.';
