import type { ComponentType } from "./types";

// Výchozí obsah nové komponenty ve studiu — rovnou funkční příklad, který jde upravit.

export const CLIENT_SCRIPT_TEMPLATE = `// Klientský skript — běží v prohlížeči v sandboxu (bez sítě, bez přístupu ke stránce).
// Funkce napoj na událost formuláře (Formulář → events) nebo na tlačítko (akce "script").
// Dokumentace: docs/upravy-firmy/skripty.md

async function onLoad(ctx) {
  // ctx.form.getValue("name"), ctx.form.setValue(...), ctx.form.setVisible(...),
  // ctx.form.setRequired(...), ctx.form.setNotification("text", "info" | "warning" | "error")
}

async function onSave(ctx) {
  // ctx.preventSave("Důvod") zastaví uložení.
}
`;

export const PLUGIN_TEMPLATE = `// Serverový plugin — běží na serveru v sandboxu (QuickJS) pod právy přihlášeného uživatele.
// Funkce se jmenuje podle události (beforeCreate, afterUpdate, command…) nebo obecně run(ctx).
// Dokumentace: docs/upravy-firmy/pluginy.md

async function beforeCreate(ctx) {
  // ctx.record = ukládané hodnoty, ctx.setValue("pole", hodnota) je změní.
  // throw new Error("Zpráva pro uživatele") uložení zastaví.
}

async function command(ctx) {
  // Tlačítko s akcí "plugin". ctx.input.recordIds = vybrané záznamy.
  // return { message: "Hotovo", redirect: "/projects" };
}
`;

export const COMPONENT_TEMPLATES: Record<Exclude<ComponentType, "entity" | "field">, unknown> = {
  form: {
    events: {
      onLoad: [],
      onSave: [],
      onChange: {},
    },
  },
  view: {
    label: "Nový pohled",
    columns: [{ field: "name" }, { field: "status_reason", label: "Důvod stavu" }, { field: "owner", label: "Vlastník" }],
    defaultSort: { field: "created_at", direction: "desc" },
    conditions: [{ field: "status", operator: "eq", value: "active" }],
  },
  command: {
    label: "Nové tlačítko",
    icon: "Zap",
    location: "form",
    action: { type: "url", url: "https://www.google.com/search?q={name}" },
  },
  script: { code: CLIENT_SCRIPT_TEMPLATE },
  plugin: { events: ["beforeCreate"], code: PLUGIN_TEMPLATE },
};
