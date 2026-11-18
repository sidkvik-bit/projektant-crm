import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotePhase {
  id: string;
  kod: string | null;
  nazev: string;
  odrazky: string[];
  cena: number;
  sort_order: number;
}

export interface NewQuotePhase {
  kod?: string | null;
  nazev: string;
  odrazky: string[];
  cena: number;
}

export const QUOTE_PHASE_COLUMNS = "id, kod, nazev, odrazky, cena, sort_order";

/**
 * Ověří, že nabídka patří do mé organizace (RLS: cizí nabídku SELECT neuvidí). Bez toho by šlo
 * fázi navázat na uhodnuté id cizí nabídky — cizí klíč organizaci nehlídá.
 */
async function assertQuoteVisible(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase.from("quotes").select("id").eq("id", quoteId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Nabídka nenalezena (nebo k ní nemáš přístup).");
}

export async function listQuotePhases(supabase: SupabaseClient, quoteId: string): Promise<QuotePhase[]> {
  const { data, error } = await supabase
    .from("quote_phases")
    .select(QUOTE_PHASE_COLUMNS)
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, cena: Number(p.cena) })) as QuotePhase[];
}

/** Přidá fáze na konec nabídky. */
export async function appendQuotePhases(supabase: SupabaseClient, quoteId: string, phases: NewQuotePhase[]) {
  if (phases.length === 0) return [];
  await assertQuoteVisible(supabase, quoteId);
  const existing = await listQuotePhases(supabase, quoteId);
  const start = existing.reduce((max, p) => Math.max(max, p.sort_order + 1), 0);
  const { data, error } = await supabase
    .from("quote_phases")
    .insert(
      phases.map((p, i) => ({
        quote_id: quoteId,
        kod: p.kod ?? null,
        nazev: p.nazev.trim(),
        odrazky: p.odrazky.map((o) => o.trim()).filter(Boolean),
        cena: p.cena,
        sort_order: start + i,
      })),
    )
    .select(QUOTE_PHASE_COLUMNS);
  if (error) throw error;
  if ((data ?? []).length !== phases.length) throw new Error("Neuložily se všechny fáze.");
  return data as QuotePhase[];
}

/** Fáze ze šablon podle zkratek (PAS, STU…) — kopie, úprava v nabídce šablonu nemění. */
export async function phasesFromTemplates(supabase: SupabaseClient, codes: string[]): Promise<NewQuotePhase[]> {
  const { data, error } = await supabase.from("quote_phase_templates").select("kod, nazev, odrazky, cena");
  if (error) throw error;
  const byCode = new Map((data ?? []).map((t) => [String(t.kod).toUpperCase(), t]));
  const missing = codes.filter((c) => !byCode.has(c.trim().toUpperCase()));
  if (missing.length > 0) {
    const known = [...byCode.keys()].join(", ") || "(žádné — založ je v Nastavení → Šablony fází)";
    throw new Error(`Šablonu fáze ${missing.join(", ")} neznám. Platné zkratky: ${known}.`);
  }
  return codes.map((c) => {
    const t = byCode.get(c.trim().toUpperCase())!;
    return { kod: t.kod, nazev: t.nazev, odrazky: t.odrazky ?? [], cena: Number(t.cena) };
  });
}

/**
 * Nahradí všechny fáze nabídky novým seznamem (MCP update_quote) — v jedné transakci (RPC),
 * takže po chybě zůstanou původní fáze, nikdy nabídka bez fází.
 */
export async function replaceQuotePhases(supabase: SupabaseClient, quoteId: string, phases: NewQuotePhase[]) {
  await assertQuoteVisible(supabase, quoteId);
  const { error } = await supabase.rpc("replace_quote_phases", {
    p_quote_id: quoteId,
    p_phases: phases.map((p) => ({
      kod: p.kod ?? null,
      nazev: p.nazev.trim(),
      odrazky: p.odrazky.map((o) => o.trim()).filter(Boolean),
      cena: p.cena,
    })),
  });
  if (error) throw error;
}

/** Prohodí fázi se sousední (nahoru = -1, dolů = 1). */
export async function moveQuotePhase(supabase: SupabaseClient, quoteId: string, phaseId: string, direction: -1 | 1) {
  const phases = await listQuotePhases(supabase, quoteId);
  const index = phases.findIndex((p) => p.id === phaseId);
  const other = phases[index + direction];
  if (index < 0 || !other) return;
  const current = phases[index];
  const results = await Promise.all([
    supabase.from("quote_phases").update({ sort_order: other.sort_order }).eq("id", current.id),
    supabase.from("quote_phases").update({ sort_order: current.sort_order }).eq("id", other.id),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
