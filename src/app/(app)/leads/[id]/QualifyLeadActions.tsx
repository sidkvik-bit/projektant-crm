"use client";

import { useState, useTransition } from "react";
import { UserCheck, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { qualifyLead } from "./actions";

/** Volá se rovnou z klienta (ne přes <form action>), aby šlo zachytit vrácenou
 * {error} a ukázat ji v dialogu — server action úmyslně chybu vrací, ne throwuje
 * (viz actions.ts), takže úspěšný běh (redirect) tímhle nikdy neprojde. */
export function QualifyLeadActions({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleQualify(createProject: boolean) {
    startTransition(async () => {
      const result = await qualifyLead(leadId, createProject);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => handleQualify(false)}>
        <UserCheck className="size-4" />
        Kvalifikovat: OV + Kontakt
      </Button>
      <Button size="sm" disabled={pending} onClick={() => handleQualify(true)}>
        <FolderPlus className="size-4" />
        Kvalifikovat: Projekt
      </Button>

      <Dialog open={error != null} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kvalifikaci nejde dokončit</DialogTitle>
            <DialogDescription>{error}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" onClick={() => setError(null)}>
              Rozumím
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
