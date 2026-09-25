import type { AuthInfo } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionSetValues, type OptionSetValue } from "@/engine/optionSets";
import type { McpSession } from "./auth";

/** Strop na počet vrácených řádků — AI klient platí za tokeny, nemá smysl mu posílat tisíce řádků. */
export const MAX_ROWS = 50;

/** Datum ve tvaru YYYY-MM-DD; date sloupce v Postgresu nic jiného nepřijmou. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Nástroje dostanou session z auth vrstvy; bez ní se nesmí spustit nic. */
export function sessionFrom(ctx: { http?: { authInfo?: AuthInfo } }): McpSession | null {
  return (ctx.http?.authInfo?.extra?.session as McpSession | undefined) ?? null;
}

/** Porovnávání bez ohledu na diakritiku a velikost písmen — model klidně napíše
 * "smlouva podepsana" místo "Smlouva podepsána" a nemá smysl ho za to trestat. */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export type OptionLookup = { value: OptionSetValue } | { available: string[] };

/** Samotné párování — oddělené od načítání dat, aby šlo testovat bez Supabase.
 * Bere jak lidský název ("Smlouva podepsána"), tak technický klíč ("smlouva_podepsana"). */
export function matchOptionValue(values: OptionSetValue[], input: string): OptionLookup {
  const needle = normalize(input);
  const match = values.find((v) => normalize(v.label) === needle || normalize(v.value_key) === needle);
  return match ? { value: match } : { available: values.map((v) => v.label) };
}

/**
 * Přeloží lidský název hodnoty číselníku ("Smlouva podepsána") na id řádku v option_set_values.
 * Číselníky jsou per-organizace a uživatel si je může přejmenovat, takže se čtou za běhu —
 * a když se netrefíme, vrací se seznam platných hodnot, aby to model mohl opravit sám.
 */
export async function resolveOptionValue(
  supabase: SupabaseClient,
  optionSetKey: string,
  input: string,
): Promise<OptionLookup> {
  try {
    return matchOptionValue(await getOptionSetValues(supabase, optionSetKey), input);
  } catch {
    return { available: [] };
  }
}

export interface UpdateSpec {
  table: string;
  id: string;
  /** Whitelist polí k zápisu; klíče s hodnotou `undefined` se zahazují (uživatel je neuvedl). */
  patch: Record<string, unknown>;
  /** Sloupce načtené před i po změně — z nich se skládá "co se změnilo". */
  columns: string;
  notFound: string;
  /** Volitelné dopřeložení id na lidské názvy (číselníky) pro čitelný výstup. */
  decorate?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Jedna úprava jednoho záznamu — a vrátí stav PŘED i PO.
 *
 * Ten before/after výstup je tu schválně: model z něj uživateli napíše, co přesně přepsal,
 * takže se změna dá odchytit hned v chatu, ne až při příštím otevření záznamu. Je to stejný
 * princip jako potvrzovací dialogy ve webu, které ukazují starou → novou hodnotu.
 *
 * Když záznam nepatří do organizace volajícího, RLS ho nepustí ani do prvního SELECTu a
 * skončí se na `notFound` — cizí data tudy neprosáknou ani jako "existuje, ale nesmíš".
 */
export async function applyUpdate(supabase: SupabaseClient, spec: UpdateSpec) {
  const patch = Object.fromEntries(Object.entries(spec.patch).filter(([, value]) => value !== undefined));
  if (Object.keys(patch).length === 0) {
    return fail("Nebylo co změnit — uveď aspoň jedno pole, které se má nastavit.");
  }

  const { data: before } = await supabase.from(spec.table).select(spec.columns).eq("id", spec.id).maybeSingle();
  if (!before) return fail(spec.notFound);

  const { data: after, error } = await supabase
    .from(spec.table)
    .update(patch)
    .eq("id", spec.id)
    .select(spec.columns)
    .maybeSingle();
  if (error) return fail(`Úprava selhala: ${error.message}`);
  if (!after) return fail(spec.notFound);

  const decorate = spec.decorate ?? ((row: Record<string, unknown>) => row);
  return ok({
    zmenena_pole: Object.keys(patch),
    pred_zmenou: decorate(before as unknown as Record<string, unknown>),
    po_zmene: decorate(after as unknown as Record<string, unknown>),
  });
}

/**
 * Založení jednoho záznamu. `organization_id` se doplňuje ze session, nikdy ze vstupu od modelu —
 * jinak by šlo nástrojem psát do cizí organizace (RLS by to sice zarazila, ale nemá smysl na ni
 * spoléhat jako na jedinou pojistku).
 */
export async function applyInsert(
  supabase: SupabaseClient,
  spec: { table: string; values: Record<string, unknown>; columns: string; organizationId: string },
) {
  const values = Object.fromEntries(Object.entries(spec.values).filter(([, v]) => v !== undefined));
  const { data, error } = await supabase
    .from(spec.table)
    .insert({ ...values, organization_id: spec.organizationId })
    .select(spec.columns)
    .single();
  if (error) return fail(`Založení selhalo: ${error.message}`);
  return ok({ vytvoreno: data });
}

/**
 * Mapa id → label pro číselník, na dopřeklad `status_reason_id` v odpovědích. UUID samo o sobě
 * modelu nic neřekne; fáze projektu ("Realizace") ano.
 */
export async function optionLabelMap(supabase: SupabaseClient, optionSetKey: string) {
  try {
    const values = await getOptionSetValues(supabase, optionSetKey);
    return new Map(values.map((v) => [v.id, v.label]));
  } catch {
    return new Map<string, string>();
  }
}

/** Nahradí `status_reason_id` čitelnou `faze` — používají read i write nástroje u projektů. */
export function withStageLabel(labels: Map<string, string>) {
  return (row: Record<string, unknown>) => {
    const { status_reason_id: stageId, ...rest } = row;
    return { ...rest, faze: typeof stageId === "string" ? (labels.get(stageId) ?? null) : null };
  };
}
