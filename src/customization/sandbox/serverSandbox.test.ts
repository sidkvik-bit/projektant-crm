import { describe, expect, it } from "vitest";
import { runInSandbox, type SandboxRun } from "./serverSandbox";

const PRELUDE = `function __makeCtx(raw) { raw.api = { echo: (x) => __call("echo", x) }; return raw; }`;

const run = (code: string, over: Partial<SandboxRun> = {}) =>
  runInSandbox({
    code,
    entry: "run",
    ctx: { n: 21 },
    prelude: PRELUDE,
    host: async (name, args) => ({ name, args }),
    ...over,
  });

describe("serverový sandbox (QuickJS)", () => {
  it("spustí async funkci, předá ctx a vyřídí volání do hosta", async () => {
    const result = await run(`async function run(ctx) { const r = await ctx.api.echo("x"); return { n: ctx.n * 2, r }; }`);
    expect(result).toMatchObject({ ok: true, value: { value: { n: 42, r: { name: "echo", args: ["x"] } } } });
  });

  it("vrátí chybu vyhozenou skriptem jako text pro uživatele", async () => {
    const result = await run(`function run() { throw new Error("Chybí IČO"); }`);
    expect(result).toMatchObject({ ok: false, error: "Chybí IČO" });
  });

  it("přeruší nekonečnou smyčku", async () => {
    const result = await run(`function run() { while (true) {} }`, { limits: { cpuMs: 100 } });
    expect(result).toMatchObject({ ok: false, error: "Skript běžel příliš dlouho a byl přerušen" });
  });

  it("ukončí skript, který nikdy nedoběhne", async () => {
    const result = await run(`async function run() { await new Promise(() => {}); }`, { limits: { wallMs: 200 } });
    expect(result.ok).toBe(false);
  });

  it("nemá přístup k Node ani síti", async () => {
    const result = await run(
      `function run() { return [typeof process, typeof require, typeof fetch, typeof globalThis.setTimeout]; }`,
    );
    expect(result).toMatchObject({ ok: true, value: { value: ["undefined", "undefined", "undefined", "undefined"] } });
  });

  it("omezí počet volání do CRM a sbírá console.log", async () => {
    const result = await run(
      `async function run(ctx) { console.log("start", 1); for (let i = 0; i < 10; i++) await ctx.api.echo(i); }`,
      { limits: { maxHostCalls: 3 } },
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("limit 3 volání") });
    expect(result.logs).toEqual(["start 1"]);
  });

  it("použije záložní funkci, když chybí funkce pro událost", async () => {
    const result = await run(`function run() { return "fallback"; }`, { entry: "beforeCreate", fallbackEntry: "run" });
    expect(result).toMatchObject({ ok: true, value: { value: "fallback" } });
  });
});
