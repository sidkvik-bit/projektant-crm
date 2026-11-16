"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createDataApi } from "./dataApi";
import { runPlugins } from "./plugins";
import { loadCustomizations } from "./repository";

// Server actions pro klientské skripty a tlačítka. Všechno běží pod přihlášeným uživatelem
// (RLS) a nad publikovanou vrstvou úprav jeho firmy.

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (err: unknown): { ok: false; error: string } => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err),
});

/** `ctx.api.*` z klientského skriptu. */
export async function scriptApiCall(name: string, args: unknown[]): Promise<ActionResult<unknown>> {
  try {
    const supabase = await createClient();
    const set = await loadCustomizations(supabase);
    const api = createDataApi(supabase, set);
    const [a, b, c] = args as [string, never, never];
    switch (name) {
      case "retrieve":
        return { ok: true, value: await api.retrieve(a, b) };
      case "query":
        return { ok: true, value: await api.query(a, b) };
      case "create":
        return { ok: true, value: await api.create(a, b) };
      case "update":
        return { ok: true, value: await api.update(a, b, c) };
      default:
        return { ok: false, error: `Neznámá operace "${name}"` };
    }
  } catch (err) {
    return fail(err);
  }
}

export interface CommandPluginResult {
  message?: string;
  redirect?: string;
}

/** Tlačítko s akcí "plugin" (nebo `ctx.api.runPlugin` ze skriptu) — událost "command". */
export async function runCommandPlugin(
  entity: string,
  pluginKey: string,
  recordIds: string[],
  revalidate?: string,
): Promise<ActionResult<CommandPluginResult>> {
  try {
    const supabase = await createClient();
    const set = await loadCustomizations(supabase);
    if (!set.find("plugin", entity, pluginKey)?.definition.events.includes("command")) {
      return { ok: false, error: `Plugin ${pluginKey} neexistuje nebo nemá událost "command"` };
    }
    const outcome = await runPlugins(supabase, set, {
      entity,
      event: "command",
      only: pluginKey,
      recordId: recordIds[0] ?? null,
      input: { recordIds },
    });
    if (revalidate?.startsWith("/")) revalidatePath(revalidate);
    const value = (outcome.value ?? {}) as CommandPluginResult;
    return {
      ok: true,
      value: {
        message: typeof value.message === "string" ? value.message : undefined,
        redirect: typeof value.redirect === "string" ? value.redirect : undefined,
      },
    };
  } catch (err) {
    return fail(err);
  }
}
