"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runCommandPlugin, scriptApiCall } from "../actions";
import { BrowserScriptSandbox, type ScriptOp, type ScriptRunContext } from "../sandbox/browserSandbox";
import type { ScriptHandler } from "../types";

/** Co s operacemi skriptu udělá konkrétní místo (formulář umí víc než seznam). */
export interface ScriptOpTarget {
  setValue?(field: string, value: unknown): void;
  setFieldState?(field: string, state: "visible" | "required" | "disabled", on: boolean): void;
  notify?(message: string, level: "info" | "warning" | "error"): void;
  clearNotifications?(): void;
}

export interface HandlerOutcome {
  ok: boolean;
  /** Zpráva z ctx.preventSave() — jen u onSave. */
  preventSave?: string;
  /** Pole, která skript změnil přes ctx.form.setValue. */
  changedFields: string[];
}

/**
 * Spouští skripty firmy v sandboxu a promítá jejich operace do stránky. Jeden sandbox (iframe)
 * na komponentu; volání `ctx.api` vyřizují server actions pod přihlášeným uživatelem.
 */
export function useScriptHost(entity: string, scripts: Record<string, string>, target: ScriptOpTarget) {
  const router = useRouter();
  const sandboxRef = useRef<BrowserScriptSandbox | null>(null);
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  useEffect(() => () => sandboxRef.current?.dispose(), []);

  const sandbox = useCallback(() => {
    sandboxRef.current ??= new BrowserScriptSandbox(async (name, args) => {
      if (name === "runPlugin") {
        const [key, recordIds] = args as [string, string[]];
        const result = await runCommandPlugin(entity, String(key), Array.isArray(recordIds) ? recordIds : []);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      }
      const result = await scriptApiCall(name, args);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    });
    return sandboxRef.current;
  }, [entity]);

  return useCallback(
    async (handler: ScriptHandler, ctx: ScriptRunContext): Promise<HandlerOutcome> => {
      const code = scripts[handler.script];
      if (code === undefined) {
        toast.error(`Skript "${handler.script}" neexistuje nebo není publikovaný.`);
        return { ok: false, changedFields: [] };
      }
      const result = await sandbox().run(code, handler.function, ctx);
      for (const line of result.logs) console.info(`[${handler.script}.${handler.function}]`, line);

      let preventSave: string | undefined;
      const changedFields: string[] = [];
      for (const op of result.ops as ScriptOp[]) {
        const t = targetRef.current;
        switch (op[0]) {
          case "setValue":
            t.setValue?.(op[1], op[2]);
            changedFields.push(op[1]);
            break;
          case "setVisible":
            t.setFieldState?.(op[1], "visible", op[2]);
            break;
          case "setRequired":
            t.setFieldState?.(op[1], "required", op[2]);
            break;
          case "setDisabled":
            t.setFieldState?.(op[1], "disabled", op[2]);
            break;
          case "notify":
            if (t.notify) t.notify(op[1], op[2]);
            else toast(op[1]);
            break;
          case "clearNotifications":
            t.clearNotifications?.();
            break;
          case "alert":
            toast(op[1]);
            break;
          case "navigate":
            navigate(router, op[1]);
            break;
          case "refresh":
            router.refresh();
            break;
          case "preventSave":
            preventSave = op[1];
            break;
        }
      }

      if (result.error) {
        toast.error(`Chyba ve skriptu ${handler.script}.${handler.function}: ${result.error}`);
        return { ok: false, preventSave, changedFields };
      }
      return { ok: true, preventSave, changedFields };
    },
    [router, sandbox, scripts],
  );
}

/** Relativní cesta = v appce, absolutní http(s) = nové okno. Jiná schémata (javascript:…) nikdy. */
export function navigate(router: ReturnType<typeof useRouter>, url: string, newTab?: boolean) {
  if (url.startsWith("/") && !url.startsWith("//")) {
    if (newTab) window.open(url, "_blank", "noopener");
    else router.push(url);
    return;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
      window.open(parsed.toString(), "_blank", "noopener");
      return;
    }
  } catch {
    // neplatná URL — níž
  }
  toast.error(`Neplatná adresa: ${url}`);
}
