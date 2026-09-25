"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyBlock } from "@/components/CopyBlock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { McpTokenRow } from "./actions";

/** Konfigurace tak, jak ji čekají klienti s konfiguračním souborem (Cursor, Claude Desktop,
 * Windsurf) — hotová k vložení, ať uživatel nic nesklada ručně. */
function buildConfigSnippet(serverUrl: string, token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "projektant-crm": {
          url: serverUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** Gemini má stejný tvar, ale vzdálený server pozná podle `httpUrl` — pod klíčem `url` by čekal
 * starší SSE přenos a nepřipojil by se. Proto zvlášť, ne jedna univerzální konfigurace. */
function buildGeminiConfigSnippet(serverUrl: string, token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "projektant-crm": {
          httpUrl: serverUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export function McpTokenManager({
  tokens,
  serverUrl,
  onCreate,
  onRevoke,
}: {
  tokens: McpTokenRow[];
  serverUrl: string;
  onCreate: (name: string) => Promise<string>;
  onRevoke: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<McpTokenRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const token = await onCreate(name);
      setNewToken(token);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vygenerování se nezdařilo.");
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await onRevoke(revoking.id);
      setRevoking(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="tokenName">Název tokenu</Label>
          <Input
            id="tokenName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="např. Claude na notebooku"
          />
        </div>
        <Button type="submit" disabled={creating}>
          <KeyRound className="size-4" />
          {creating ? "Generuji…" : "Vygenerovat token"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {tokens.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Aktivní tokeny</h2>
          {tokens.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  Vytvořen {new Date(token.createdAt).toLocaleDateString("cs-CZ")} ·{" "}
                  {token.lastUsedAt
                    ? `naposledy použit ${new Date(token.lastUsedAt).toLocaleString("cs-CZ")}`
                    : "zatím nepoužit"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRevoking(token)}>
                Odvolat
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={newToken !== null} onOpenChange={(open) => !open && setNewToken(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Hotovo — zbývá zkopírovat</DialogTitle>
            <DialogDescription>
              Zkopíruj blok níž a vlož ho do konfigurace svého AI klienta. Token vidíš teď naposledy — už ho
              znovu neukážeme ani my, v databázi je uložený jen jeho otisk.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {newToken && (
              <CopyBlock
                text={buildConfigSnippet(serverUrl, newToken)}
                label="Claude Desktop, Cursor, Windsurf"
              />
            )}
            {newToken && (
              <CopyBlock text={buildGeminiConfigSnippet(serverUrl, newToken)} label="Gemini CLI / Code Assist" />
            )}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Klienti, které se ptají na adresu a token zvlášť (např. Claude → Connectors), chtějí tyhle dvě
                hodnoty:
              </p>
              <CopyBlock text={serverUrl} label="Adresa serveru" />
              {newToken && <CopyBlock text={newToken} label="Token" />}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Hotovo, zkopírováno</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odvolat token &quot;{revoking?.name}&quot;?</DialogTitle>
            <DialogDescription>
              AI klient, který ho používá, okamžitě ztratí přístup k tvým datům. Tuhle akci nejde vzít zpět —
              pro další použití bude potřeba vygenerovat nový token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={confirmRevoke} disabled={busy}>
              {busy ? "Odvolávám…" : "Ano, odvolat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
