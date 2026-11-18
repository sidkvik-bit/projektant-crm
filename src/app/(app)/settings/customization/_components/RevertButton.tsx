"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { revertPublish } from "@/customization/studioActions";

export function RevertButton({ publishId, number, changeCount }: { publishId: string; number: number; changeCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function revert() {
    setBusy(true);
    const result = await revertPublish(publishId);
    setBusy(false);
    setOpen(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(`Vrácení verze #${number} je připravené v rozpracovaných změnách — zkontroluj a publikuj.`);
    router.push("/settings/customization/publish");
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" />
        Vrátit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vrátit publikaci #{number}?</DialogTitle>
            <DialogDescription>
              {changeCount} {changeCount === 1 ? "komponenta se vrátí" : "komponent se vrátí"} do stavu před touto
              publikací — jako rozpracované změny. Nic se nepublikuje, dokud to nepotvrdíš na stránce Publikovat.
              Pozdější úpravy stejných komponent se tím přepíšou.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Zrušit
            </Button>
            <Button onClick={revert} disabled={busy}>
              {busy ? "Připravuji…" : "Připravit vrácení"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
