// Sandbox pro klientské skripty firem (události formuláře, tlačítka). Skript běží ve web
// workeru ve skrytém <iframe sandbox="allow-scripts"> bez allow-same-origin: má neprůhledný
// origin, takže nevidí cookies, session, DOM appky ani localStorage, a CSP v iframu mu zakazuje síť
// (fetch, obrázky, formuláře). S appkou mluví jen zprávami: dostane snímek hodnot formuláře,
// vrátí seznam operací (nastav pole, skryj, upozorni…) a data čte/zapisuje přes `api`, které
// appka vyřídí server action pod právy přihlášeného uživatele.

export type ScriptOp =
  | ["setValue", string, unknown]
  | ["setVisible", string, boolean]
  | ["setRequired", string, boolean]
  | ["setDisabled", string, boolean]
  | ["notify", string, "info" | "warning" | "error"]
  | ["clearNotifications"]
  | ["alert", string]
  | ["navigate", string]
  | ["refresh"]
  | ["preventSave", string];

export interface ScriptRunContext {
  entity: string;
  recordId: string | null;
  event: { type: "onLoad" | "onChange" | "onSave" | "command"; field?: string; command?: string };
  values: Record<string, unknown>;
  selectedIds?: string[];
}

export interface ScriptRunResult {
  ops: ScriptOp[];
  logs: string[];
  error?: string;
}

export type ScriptApiHandler = (name: string, args: unknown[]) => Promise<unknown>;

const RUN_TIMEOUT_MS = 10_000;
const MAX_API_CALLS = 50;

// Kód firmy běží ve web workeru uvnitř iframu — na vlastním vlákně, takže ani nekonečná
// smyčka nezamrzne stránku a worker jde po timeoutu ukončit. Iframe jen přeposílá zprávy.
const WORKER = `
const pending = new Map();
let seq = 0;
const call = (name, args) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  postMessage({ kind: "api", id, name, args: JSON.parse(JSON.stringify(args)) });
});
const str = (x) => typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })();
onmessage = async (event) => {
  const m = event.data || {};
  if (m.kind === "apiResult") {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
    return;
  }
  if (m.kind !== "run") return;
  const ops = [];
  const logs = [];
  const values = Object.assign({}, m.ctx.values);
  console.log = console.info = console.warn = console.error = (...a) => logs.push(a.map(str).join(" ").slice(0, 2000));
  const ctx = {
    entity: m.ctx.entity,
    recordId: m.ctx.recordId,
    event: m.ctx.event,
    selectedIds: m.ctx.selectedIds || [],
    form: {
      getValue: (name) => values[name] === undefined ? null : values[name],
      getValues: () => Object.assign({}, values),
      setValue: (name, value) => { values[name] = value; ops.push(["setValue", String(name), value === undefined ? null : value]); },
      setVisible: (name, visible) => ops.push(["setVisible", String(name), !!visible]),
      setRequired: (name, required) => ops.push(["setRequired", String(name), !!required]),
      setDisabled: (name, disabled) => ops.push(["setDisabled", String(name), !!disabled]),
      setNotification: (message, level) => ops.push(["notify", String(message), ["info", "warning", "error"].includes(level) ? level : "info"]),
      clearNotifications: () => ops.push(["clearNotifications"]),
    },
    ui: { alert: (message) => ops.push(["alert", String(message)]) },
    navigate: (url) => ops.push(["navigate", String(url)]),
    refresh: () => ops.push(["refresh"]),
    preventSave: (message) => ops.push(["preventSave", String(message || "Uložení zastavil skript")]),
    api: {
      retrieve: (entity, id) => call("retrieve", [entity, id]),
      query: (entity, options) => call("query", [entity, options || {}]),
      create: (entity, values) => call("create", [entity, values]),
      update: (entity, id, values) => call("update", [entity, id, values]),
      runPlugin: (key, recordIds) => call("runPlugin", [key, recordIds || (m.ctx.recordId ? [m.ctx.recordId] : [])]),
    },
  };
  try {
    const fn = new Function(m.code + "\\n;return typeof " + m.fn + " === 'function' ? " + m.fn + " : null;")();
    if (!fn) throw new Error("Ve skriptu chybí funkce " + m.fn);
    await fn(ctx);
    postMessage({ kind: "done", runId: m.runId, ops: JSON.parse(JSON.stringify(ops)), logs });
  } catch (err) {
    postMessage({ kind: "done", runId: m.runId, ops: JSON.parse(JSON.stringify(ops)), logs, error: String((err && err.message) || err) });
  }
};
`;

const RUNNER = `
const workerUrl = URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}], { type: "text/javascript" }));
let worker = null;
const startWorker = () => {
  worker = new Worker(workerUrl);
  worker.onmessage = (event) => parent.postMessage(event.data, "*");
};
startWorker();
addEventListener("message", (event) => {
  if (event.source !== parent) return;
  const m = event.data || {};
  if (m.kind === "kill") { worker.terminate(); startWorker(); return; }
  worker.postMessage(m);
});
parent.postMessage({ kind: "ready" }, "*");
`;

const SRCDOC = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
</head><body><script>${RUNNER}</script></body></html>`;

/** Jeden sandbox (iframe) na formulář/seznam — skripty v něm běží jeden po druhém. */
export class BrowserScriptSandbox {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private runSeq = 0;

  constructor(private readonly api: ScriptApiHandler) {}

  run(code: string, fn: string, ctx: ScriptRunContext): Promise<ScriptRunResult> {
    const next = this.queue.then(() => this.runNow(code, fn, ctx));
    this.queue = next.catch(() => undefined);
    return next;
  }

  dispose() {
    this.frame?.remove();
    this.frame = null;
    this.ready = null;
  }

  private ensureFrame(): Promise<void> {
    if (this.ready && this.frame) return this.ready;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.display = "none";
    this.ready = new Promise((resolve) => {
      const onReady = (event: MessageEvent) => {
        if (event.source === frame.contentWindow && event.data?.kind === "ready") {
          window.removeEventListener("message", onReady);
          resolve();
        }
      };
      window.addEventListener("message", onReady);
    });
    frame.srcdoc = SRCDOC;
    document.body.appendChild(frame);
    this.frame = frame;
    return this.ready;
  }

  private async runNow(code: string, fn: string, ctx: ScriptRunContext): Promise<ScriptRunResult> {
    await this.ensureFrame();
    const frame = this.frame!;
    const runId = ++this.runSeq;
    let apiCalls = 0;

    return new Promise<ScriptRunResult>((resolve) => {
      const finish = (result: ScriptRunResult) => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        resolve(result);
      };

      const onMessage = async (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;
        const m = event.data ?? {};
        if (m.kind === "done" && m.runId === runId) {
          finish({ ops: m.ops ?? [], logs: m.logs ?? [], error: m.error });
        } else if (m.kind === "api") {
          const reply = (payload: { value?: unknown; error?: string }) =>
            frame.contentWindow?.postMessage({ kind: "apiResult", id: m.id, ...payload }, "*");
          if (++apiCalls > MAX_API_CALLS) return reply({ error: `Překročen limit ${MAX_API_CALLS} volání CRM v jednom běhu` });
          try {
            reply({ value: await this.api(String(m.name), Array.isArray(m.args) ? m.args : []) });
          } catch (err) {
            reply({ error: err instanceof Error ? err.message : String(err) });
          }
        }
      };

      // Zaseknutý skript (nekonečná smyčka, nikdy nesplněný await) — worker se ukončí a
      // příští běh dostane nový.
      const timer = setTimeout(() => {
        frame.contentWindow?.postMessage({ kind: "kill" }, "*");
        finish({ ops: [], logs: [], error: `Skript nedoběhl do ${RUN_TIMEOUT_MS / 1000} s` });
      }, RUN_TIMEOUT_MS);

      window.addEventListener("message", onMessage);
      frame.contentWindow?.postMessage({ kind: "run", runId, code, fn, ctx: JSON.parse(JSON.stringify(ctx)) }, "*");
    });
  }
}
