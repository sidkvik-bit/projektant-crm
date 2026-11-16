"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteComponent, discardComponentDraft } from "@/customization/studioActions";
import type { ComponentType } from "@/customization/types";
import type { ComponentStatus } from "@/customization/studio";

/** Zahodit rozpracovanou změnu / smazat komponentu — obojí s potvrzením (co se stane). */
export function ComponentActions({
  type,
  entity,
  componentKey,
  status,
  label,
}: {
  type: ComponentType;
  entity: string;
  componentKey: string;
  status: ComponentStatus;
  label: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result =
      confirm === "discard"
        ? await discardComponentDraft(type, entity, componentKey)
        : await deleteComponent(type, entity, componentKey);
    setBusy(false);
    setConfirm(null);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  const canDiscard = status === "changed" || status === "deleted";
  const canDelete = status !== "deleted";

  return (
    <>
      {canDiscard && (
        <Button variant="ghost" size="sm" onClick={() => setConfirm("discard")} title="Zahodit rozpracovanou změnu">
          <RotateCcw className="size-4" />
          Zahodit změnu
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="icon-sm" onClick={() => setConfirm("delete")} aria-label={`Smazat ${label}`}>
          <Trash2 className="size-4" />
        </Button>
      )}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "discard" ? "Zahodit rozpracovanou změnu?" : `Smazat ${label}?`}</DialogTitle>
            <DialogDescription>
              {confirm === "discard"
                ? "Vrátí se publikovaná verze. Rozpracované úpravy této komponenty se ztratí."
                : status === "new"
                  ? "Komponenta ještě nebyla publikovaná — smaže se hned."
                  : "Komponenta zmizí až po publikování. Do té doby ji uživatelé vidí beze změny. Hodnoty vlastních polí v záznamech zůstanou v databázi, jen se přestanou zobrazovat."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button variant={confirm === "delete" ? "destructive" : "default"} onClick={run} disabled={busy}>
              {busy ? "Pracuji…" : confirm === "discard" ? "Zahodit" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
