"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { cs } from "date-fns/locale";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmailSyncStatus } from "./actions";
import { disconnectEmailSync } from "./actions";

export function EmailSyncStatusCard({ status }: { status: EmailSyncStatus }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const redirectStatus = searchParams.get("status");
  const redirectMessage = searchParams.get("message");

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectEmailSync();
      setDisconnectOpen(false);
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-3">
      {redirectStatus === "connected" && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-status-success">
          <CheckCircle2 className="size-4 shrink-0" />
          Schránka je připojená.
        </div>
      )}
      {redirectStatus === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <XCircle className="size-4 shrink-0" />
          {redirectMessage || "Připojení se nezdařilo."}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Mail className="size-5 text-muted-foreground" />
          </div>
          {status.connected ? (
            <div>
              <p className="text-sm font-medium">Připojeno jako {status.mailboxEmail}</p>
              <p className="text-xs text-muted-foreground">
                {status.lastSyncedAt
                  ? `Naposledy synchronizováno ${formatDistanceToNowStrict(new Date(status.lastSyncedAt), { locale: cs, addSuffix: true })}`
                  : "Zatím nebyla provedena žádná synchronizace."}
                {" · "}synchronizuje se každých 15 minut
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Žádná schránka není připojená</p>
              <p className="text-xs text-muted-foreground">Postupuj podle návodu níž.</p>
            </div>
          )}
        </div>

        {status.connected ? (
          <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
            <Button type="button" variant="outline" size="sm" onClick={() => setDisconnectOpen(true)}>
              Odpojit
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Odpojit e-mailovou schránku?</DialogTitle>
                <DialogDescription>
                  {status.mailboxEmail} přestane appka synchronizovat. Už zalogované aktivity zůstanou zachované,
                  jen nepřibudou nové.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
                  Zrušit
                </Button>
                <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? "Odpojuji…" : "Ano, odpojit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button type="button" size="sm" render={<a href="/api/google/gmail/authorize" />}>
            <Mail className="size-4" />
            Připojit e-mailovou schránku
          </Button>
        )}
      </div>
    </div>
  );
}
