import type { McpServer } from "@modelcontextprotocol/server";

/**
 * Výchozí MCP anotace podle druhu nástroje (název = sloveso_předmět). Klient podle nich
 * rozhoduje, kdy se ptát uživatele na svolení — bez anotace bere každý nástroj jako
 * potenciálně destruktivní a ptá se i u čtení, nebo si ho uživatel povolí „vždy“ celý.
 * Anotace jsou jen nápověda pro klienta, ne bezpečnost: tu drží RLS a potvrzení ve webu.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

const READ = /^(list|get|describe|search|find|upcoming|preview|request)_/;
const ADDITIVE = /^(create|add|log|apply|save|qualify)_/;
const IDEMPOTENT_WRITE = /^(update|set|mark)_/;

export function defaultAnnotations(toolName: string): ToolAnnotations {
  // CRM je uzavřený svět — žádný nástroj nesahá na externí systémy (kromě geokódování adresy).
  const base = { openWorldHint: false };
  if (READ.test(toolName)) return { ...base, readOnlyHint: true };
  if (ADDITIVE.test(toolName)) return { ...base, readOnlyHint: false, destructiveHint: false };
  if (IDEMPOTENT_WRITE.test(toolName)) return { ...base, readOnlyHint: false, destructiveHint: true, idempotentHint: true };
  return { ...base, readOnlyHint: false, destructiveHint: true };
}

/** Doplní výchozí anotace každému nástroji registrovanému na serveru (explicitní mají přednost). */
export function withDefaultAnnotations(server: McpServer): McpServer {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: { annotations?: ToolAnnotations }, callback: unknown) =>
    register(
      name,
      { ...config, annotations: { ...defaultAnnotations(name), ...config.annotations } } as never,
      callback as never,
    )) as typeof server.registerTool;
  return server;
}
