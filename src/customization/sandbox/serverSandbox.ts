import { newQuickJSWASMModuleFromVariant, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten-core";

// Sandbox pro serverové pluginy firem: QuickJS (samostatný JS engine ve WASM) — kód firmy
// nevidí Node, síť, soubory, proměnné prostředí ani klíče. Ven vede jen funkce __host, přes
// kterou volá povolené operace (data API pod právy přihlášeného uživatele, log). Volání jsou
// asynchronní přes promisy QuickJS: host vrátí promise a po vyřízení pumpuje frontu jobů.

export interface SandboxLimits {
  /** Čistý čas výpočtu (smyčky) — přeruší ho interrupt handler QuickJS. */
  cpuMs: number;
  /** Celkový čas včetně čekání na volání do CRM. */
  wallMs: number;
  memoryBytes: number;
  maxHostCalls: number;
}

export const DEFAULT_LIMITS: SandboxLimits = {
  cpuMs: 2_000,
  wallMs: 10_000,
  memoryBytes: 32 * 1024 * 1024,
  maxHostCalls: 50,
};

export type HostHandler = (name: string, args: unknown[]) => Promise<unknown>;

export interface SandboxRun {
  code: string;
  /** Název funkce ve skriptu, která se zavolá s ctx (async i sync). */
  entry: string;
  /** Záložní funkce, když `entry` ve skriptu není (např. obecné `run`). */
  fallbackEntry?: string;
  /** Data předaná skriptu jako ctx (musí jít serializovat do JSON). */
  ctx: Record<string, unknown>;
  /** Kód v sandboxu, který doplní ctx o funkce (api, setValue…) nad __host. */
  prelude: string;
  host: HostHandler;
  limits?: Partial<SandboxLimits>;
}

export type SandboxResult =
  | { ok: true; value: unknown; logs: string[]; durationMs: number }
  | { ok: false; error: string; logs: string[]; durationMs: number };

let modulePromise: Promise<QuickJSWASMModule> | null = null;
const getModule = () =>
  (modulePromise ??= newQuickJSWASMModuleFromVariant(import("@jitl/quickjs-wasmfile-release-sync")));

export async function runInSandbox(run: SandboxRun): Promise<SandboxResult> {
  const limits = { ...DEFAULT_LIMITS, ...run.limits };
  const started = Date.now();
  const logs: string[] = [];
  const QuickJS = await getModule();
  const vm = QuickJS.newContext();
  let disposed = false;
  let hostCalls = 0;
  const elapsed = () => Date.now() - started;

  try {
    vm.runtime.setMemoryLimit(limits.memoryBytes);
    vm.runtime.setMaxStackSize(1024 * 1024);
    vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(started + limits.cpuMs));

    const host = vm.newFunction("__host", (nameHandle, argsHandle) => {
      const name = vm.getString(nameHandle);
      const args = JSON.parse(vm.getString(argsHandle)) as unknown[];
      const deferred = vm.newPromise();

      const call: Promise<unknown> =
        name === "log"
          ? Promise.resolve(void logs.push(args.map(String).join(" ").slice(0, 2000)))
          : ++hostCalls > limits.maxHostCalls
            ? Promise.reject(new Error(`Překročen limit ${limits.maxHostCalls} volání CRM v jednom běhu`))
            : run.host(name, args);

      call.then(
        (value) => {
          if (disposed) return;
          const handle = vm.newString(JSON.stringify(value ?? null));
          deferred.resolve(handle);
          handle.dispose();
        },
        (error: unknown) => {
          if (disposed) return;
          const handle = vm.newError(error instanceof Error ? error.message : String(error));
          deferred.reject(handle);
          handle.dispose();
        },
      );
      deferred.settled.then(() => {
        if (!disposed) vm.runtime.executePendingJobs();
      });
      return deferred.handle;
    });
    vm.setProp(vm.global, "__host", host);
    host.dispose();

    const ctxHandle = vm.newString(JSON.stringify(run.ctx));
    vm.setProp(vm.global, "__ctxJson", ctxHandle);
    ctxHandle.dispose();

    const entry = JSON.stringify(run.entry);
    const fallback = JSON.stringify(run.fallbackEntry ?? run.entry);
    const program = `${PRELUDE_BASE}
${run.prelude}
${run.code}
;(async () => {
  const ctx = __makeCtx(JSON.parse(__ctxJson));
  const fn = typeof globalThis[${entry}] === "function" ? globalThis[${entry}]
    : typeof globalThis[${fallback}] === "function" ? globalThis[${fallback}] : null;
  if (!fn) throw new Error("Ve skriptu chybí funkce " + ${entry});
  const value = await fn(ctx);
  return JSON.stringify({ value: value === undefined ? null : value, extra: ctx.__extra ?? null });
})()`;

    const evaluated = vm.evalCode(program, "customization.js");
    if (evaluated.error) {
      const error = describeError(vm.dump(evaluated.error));
      evaluated.error.dispose();
      return { ok: false, error, logs, durationMs: elapsed() };
    }

    const settled = vm.resolvePromise(evaluated.value);
    evaluated.value.dispose();
    vm.runtime.executePendingJobs();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), Math.max(0, limits.wallMs - elapsed()));
    });
    const outcome = await Promise.race([settled, timeout]);
    clearTimeout(timer);

    if (outcome === "timeout") {
      return { ok: false, error: `Skript nedoběhl do ${limits.wallMs / 1000} s`, logs, durationMs: elapsed() };
    }
    if (outcome.error) {
      const error = describeError(vm.dump(outcome.error));
      outcome.error.dispose();
      return { ok: false, error, logs, durationMs: elapsed() };
    }
    const value = JSON.parse(vm.getString(outcome.value)) as unknown;
    outcome.value.dispose();
    return { ok: true, value, logs, durationMs: elapsed() };
  } finally {
    disposed = true;
    try {
      vm.dispose();
    } catch {
      // Přerušený skript může nechat živé handly — runtime se stejně zahodí celý.
    }
  }
}

// Základ prostředí: console.log → log (čte se v Přizpůsobení → Log), žádné jiné globály navíc.
const PRELUDE_BASE = `
const __call = async (name, ...args) => JSON.parse(await __host(name, JSON.stringify(args)));
globalThis.console = {
  log: (...a) => { __host("log", JSON.stringify(a.map(x => typeof x === "string" ? x : JSON.stringify(x)))); },
};
globalThis.console.error = globalThis.console.log;
globalThis.console.warn = globalThis.console.log;
`;

function describeError(dumped: unknown): string {
  if (dumped && typeof dumped === "object" && "message" in dumped) {
    const { name, message } = dumped as { name?: string; message?: string };
    if (name === "InternalError" && message === "interrupted") return "Skript běžel příliš dlouho a byl přerušen";
    if (name === "InternalError" && message === "out of memory") return "Skript překročil limit paměti";
    return String(message);
  }
  return String(dumped);
}
