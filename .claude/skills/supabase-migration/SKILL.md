---
name: supabase-migration
description: Conventions for writing a migration in supabase/migrations/ of this project — new tenant table wiring (system-field triggers, audit, owner, RLS via get_my_organization_id), safe column changes, foreign-key naming, option-set seeds, and the solution metadata (Entity.json) that must follow a schema change. Use before creating or editing any .sql file under supabase/migrations/.
---

# Writing a migration in this project

Adapted from ECC's `database-migrations` skill, cut down to what applies here: one Postgres
(Supabase), plain SQL files, small tables (hundreds to thousands of rows per org), and a
multi-tenant model enforced by RLS and triggers.

## File

- `supabase/migrations/YYYYMMDDHHMMSS_snake_case_description.sql`, timestamp later than the last
  file in the folder (check `ls supabase/migrations | tail -1` — timestamps here are not wall-clock).
- Header comment in Czech: what the migration does **and why**. Section comments in the
  `-- ----` style used by the existing files. Comment the non-obvious decisions, not the SQL.
- **Never edit a migration that has already been applied** — write a new one that fixes it
  (`20260904161500_fix_quote_items_system_fields.sql` is the precedent).

## New tenant table — every item is required

The loops in `init_core_schema.sql` that wired tenant tables have long since run. A new table
gets nothing automatically. Template: `20260830190000_add_bugs_table.sql` (a table with an
owner) or the `quote_items` half of `20260904160000_add_quotes.sql` (a child table, no owner).

1. Columns: `id uuid primary key default gen_random_uuid()`,
   `organization_id uuid not null references public.organizations(id) on delete cascade`,
   `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`,
   `created_by uuid`, `modified_by uuid`. Main entities also have `owner_id`, `status`,
   `status_reason_id`.
   **The system columns must exist before the triggers are attached**, or the first insert fails
   with `record "new" has no field "created_by"`.
2. Triggers: `<t>_before_insert` → `trg_set_insert_system_fields()`,
   `<t>_before_update` → `trg_set_update_system_fields()`,
   `<t>_audit` (after insert/update/delete) → `trg_audit_log()`,
   and for entities with an owner `<t>_owner_before_insert` → `trg_set_insert_owner()`.
3. `alter table … enable row level security` plus four policies (`_select`, `_insert`,
   `_update` with both `using` and `with check`, `_delete`), all
   `organization_id = public.get_my_organization_id()`.
4. Indexes on `organization_id` and on every foreign-key column.

## Changing existing tables

- **Never rename a column that has a foreign key with `RENAME COLUMN` alone.** The constraint keeps
  its old name, and code builds PostgREST embeds from `<table>_<column>_fkey` (`src/engine/exportToExcel.ts`,
  the list pages under `src/app/(app)/*/page.tsx` and the PDF routes). Drop the constraint and re-add it under the default name.
- `drop table … cascade` drops constraints, not the referencing columns. Drop or fix the orphaned
  column explicitly — a leftover `NOT NULL` column breaks every later insert.
- New `NOT NULL` column on an existing table: give it a `default`, then backfill in the same file
  if the default is not the right historical value (see `je_platce_dph` in
  `20261002100000_vat_and_document_billing.sql`). Comment why the backfill picks that value.
- `organization_id`, `created_at`, `created_by` are forced by triggers. Don't try to set or
  backdate them from SQL or tests; `organization_id` can only change through the two security
  definer RPCs for organization switching.
- `CREATE INDEX CONCURRENTLY` cannot run inside the migration transaction and the tables are small —
  use a plain `create index`.

## Functions

- `security definer` functions always get `set search_path = public`.
- A security definer function bypasses RLS — it must check the caller's organization (or role via
  `is_org_admin()` / `is_platform_superadmin()`) itself before touching data.
- Multi-step writes that must succeed together (create A, then B, then link) belong in one RPC
  function so they run in one transaction — `qualify_lead` is the precedent. Two sequential
  supabase-js calls from a server action are not atomic.
- `create or replace` replaces the whole body. When changing a seed function
  (`seed_default_option_sets`, `seed_commerce_option_sets`), copy the current full body from the
  latest migration that defines it, not from the first one.

## Option sets

New option-set values go to two places: the seed function (for organizations created later) and a
backfill for existing organizations. Use `on conflict … do nothing` so the backfill is idempotent.
Don't delete a value that existing records reference — check with `not exists` first.

## After the SQL — the rest of the change

- Register new or renamed columns in `src/solutions/Projektant_CRM/Entities/<Entity>/Entity.json`
  and, if the field belongs on the form, in `FormXml/main_form.json`.
- Grep `src/` for the old name of anything renamed or dropped — `select(...)` strings are not
  type-checked.
- Have the `database-reviewer` agent review the migration before applying it.
- After applying: full verification (tsc, eslint, vitest, full E2E). For FK changes also open a
  company, the kanban, the project overview, an Excel export and both PDFs —
  `e2e/tests/client-column.spec.ts` covers most of that; extend it rather than checking by hand.
