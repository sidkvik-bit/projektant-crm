import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityDefinition } from "@/engine/types";

/**
 * Fakturační nastavení firmy, které potřebují doklady. Jedno místo, odkud se čte — nabídka,
 * faktura i jejich formuláře se musí shodnout na tom, jestli se počítá DPH (PDF už bere
 * plátcovství z dokladu samotného).
 */
export interface BillingSettings {
  jePlatceDph: boolean;
  /** Sazba pro nové doklady. U neplátce vždy 0, ať se nikam nedostane 21 % "pro jistotu". */
  defaultVatRate: number;
}

const FALLBACK: BillingSettings = { jePlatceDph: false, defaultVatRate: 0 };

/** Výchozí hodnoty nového dokladu z nastavení firmy přihlášeného uživatele. */
export interface DocumentDefaults extends BillingSettings {
  quoteValidityDays: number;
}

/**
 * Nastavení organizace přihlášeného uživatele.
 *
 * Filtr na `user_id` je nutný: RLS na `users` vrací všechny členy organizace, a bez něj by
 * `maybeSingle()` ve firmě se dvěma lidmi skončil chybou. Chyba se vyhazuje — tichý návrat
 * na "neplátce, 0 %" by plátci předvyplnil doklad bez DPH a nikdo by si toho nevšiml.
 */
export async function getDocumentDefaults(supabase: SupabaseClient): Promise<DocumentDefaults> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nepřihlášený uživatel.");

  const { data, error } = await supabase
    .from("users")
    .select("organizations(je_platce_dph, default_vat_rate, default_quote_validity_days)")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;

  const org = data.organizations as unknown as {
    je_platce_dph: boolean;
    default_vat_rate: number | string;
    default_quote_validity_days: number | null;
  } | null;
  if (!org) throw new Error("Uživatel nemá organizaci.");

  return {
    ...toBillingSettings(org.je_platce_dph, org.default_vat_rate),
    quoteValidityDays: org.default_quote_validity_days ?? 30,
  };
}

/** Převod sloupců organizace na nastavení — neplátce má vždy sazbu 0. */
export function toBillingSettings(
  jePlatceDph: boolean | null | undefined,
  defaultVatRate: number | string | null | undefined,
): BillingSettings {
  if (!jePlatceDph) return FALLBACK;
  return { jePlatceDph: true, defaultVatRate: Number(defaultVatRate ?? 21) };
}

/**
 * Neplátci se sazba DPH na dokladu needituje — trigger `*_freeze_vat` by ji stejně vrátil na 0
 * a uživatel by uložil 21 % a uviděl 0 bez vysvětlení.
 */
export function lockVatRateUnlessPayer<E extends EntityDefinition>(entity: E, jePlatceDph: boolean): E {
  if (jePlatceDph) return entity;
  return {
    ...entity,
    fields: entity.fields.map((f) => (f.name === "vat_rate" ? { ...f, readOnly: true } : f)),
  };
}
