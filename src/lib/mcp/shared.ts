import type { AuthInfo } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionSetValues, type OptionSetValue } from "@/engine/optionSets";
import { createRecord, updateRecord } from "@/engine/Database";
import { returnPluginError } from "@/customization/plugins";
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

/** Sjednotí hodnotu pro porovnání "poslal jsem" × "uložilo se": numeric chodí z PostgRESTu
 * i jako řetězec, prázdný text a null znamenají totéž. */
function comparable(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

/**
 * Pole, která se po zápisu v databázi neobjevila tak, jak je model poslal (trigger, plugin
 * firmy nebo chybějící sloupec je zahodil či přepsal). Dřív se to tiše polykalo a nástroj hlásil
 * úspěch — model pak uživateli tvrdil, že něco uložil, i když to v CRM nebylo.
 */
export function unsavedFields(requested: Record<string, unknown>, stored: Record<string, unknown> | null) {
  return Object.entries(requested)
    .filter(([key, value]) => comparable(stored?.[key]) !== comparable(value))
    .map(([key, value]) => ({ pole: key, poslano: value, ulozeno: stored?.[key] ?? null }));
}

function unsavedMessage(action: string, id: string, problems: ReturnType<typeof unsavedFields>) {
  return `${action} (id ${id}), ale tato pole se neuložila tak, jak byla poslána: ${JSON.stringify(problems)}. Řekni to uživateli — v CRM jsou jiné hodnoty, než chtěl.`;
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

  // Přes datovou vrstvu, ať proběhnou pluginy firmy (validace, dopočty) jako při uložení z webu.
  const saved = await returnPluginError(() => updateRecord(supabase, spec.table, spec.id, patch)).catch(
    (err: { message?: string }) => ({ error: `Úprava selhala: ${err.message ?? String(err)}` }),
  );
  if ("error" in saved) return fail(String(saved.error));
  const { data: after } = await supabase.from(spec.table).select(spec.columns).eq("id", spec.id).maybeSingle();
  if (!after) return fail(spec.notFound);

  const { data: stored } = await supabase.from(spec.table).select(Object.keys(patch).join(", ")).eq("id", spec.id).maybeSingle();
  const problems = unsavedFields(patch, stored as Record<string, unknown> | null);
  if (problems.length > 0) return fail(unsavedMessage("Záznam se upravil", spec.id, problems));

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
  // Přes datovou vrstvu, ať proběhnou pluginy firmy jako při založení z webu.
  const created = await returnPluginError(() =>
    createRecord<{ id: string }>(supabase, spec.table, { ...values, organization_id: spec.organizationId }),
  ).catch((err: { message?: string }) => ({ error: `Založení selhalo: ${err.message ?? String(err)}` }));
  if ("error" in created) return fail(String(created.error));

  const { data: stored } = await supabase.from(spec.table).select(Object.keys(values).join(", ")).eq("id", created.id).maybeSingle();
  const problems = unsavedFields(values, stored as Record<string, unknown> | null);
  if (problems.length > 0) return fail(unsavedMessage("Záznam se založil", created.id, problems));

  const { data } = await supabase.from(spec.table).select(spec.columns).eq("id", created.id).single();
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
