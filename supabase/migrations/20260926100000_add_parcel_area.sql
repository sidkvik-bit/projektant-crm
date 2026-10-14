-- Výměra parcely.
--
-- Parcely se nově dají vyhledat přímo v RÚIAN (vrstva Parcela mapové služby ČÚZK, viz
-- src/lib/ruianParcels.ts) a katastr u každé vede i výměru. Když už ji ta odpověď nese a
-- projektant s ní běžně počítá, ukládá se rovnou k parcele, ať se nemusí dohledávat jinde.
--
-- Nullable: parcely zapsané ručně (nebo ty, co už v tabulce jsou) výměru mít nemusí.
-- Sloupec je jen data, žádné triggery ani RLS se nepřidávají — ty už tabulka má
-- z 20260925150000_tester_feedback.sql.
alter table public.project_parcels
  add column vymera_m2 numeric(12, 2);

comment on column public.project_parcels.vymera_m2 is
  'Výměra parcely v m² podle katastru. Vyplní se při výběru parcely z RÚIAN, ručně nepovinná.';
