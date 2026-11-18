"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publishCustomizations } from "@/customization/studioActions";

export function PublishPanel({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    const result = await publishCustomizations(message);
    setBusy(false);
    setConfirmOpen(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Publikováno jako verze #${result.value}.`);
    router.push("/settings/customization/history");
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="publish-message">Popis změny (uvidíš ho v historii)</Label>
        <Input
          id="publish-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Např. Číslo zakázky na projektu + tlačítko Vytvořit nabídku"
        />
      </div>
      {error && <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}
      <Button onClick={() => setConfirmOpen(true)} disabled={pendingCount === 0 || busy}>
        <Rocket className="size-4" />
        Publikovat {pendingCount} {pendingCount === 1 ? "změnu" : pendingCount < 5 ? "změny" : "změn"}
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publikovat změny pro celou firmu?</DialogTitle>
            <DialogDescription>
              Rozpracované → publikované: {pendingCount} {pendingCount === 1 ? "komponenta" : "komponent"}. Všichni
              uživatelé firmy je uvidí hned. Kdyby něco nefungovalo, publikaci vrátíš v Historii.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Zrušit
            </Button>
            <Button onClick={publish} disabled={busy}>
              {busy ? "Publikuji…" : "Ano, publikovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
