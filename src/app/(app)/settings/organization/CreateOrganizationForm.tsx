"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/** Založení nové firmy tady (na rozdíl od onboardingu) taky přepne existujícího uživatele pryč
 * z jeho současné — proto potvrzovací dialog stejně jako SwitchOrganizationList. */
export function CreateOrganizationForm({
  currentOrgName,
  action,
}: {
  currentOrgName: string;
  action: (organizationName: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function confirmCreate() {
    setSubmitting(true);
    try {
      await action(name.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) setConfirmOpen(true);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="newOrganizationName">Název firmy</Label>
          <Input id="newOrganizationName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button type="submit" variant="outline" disabled={name.trim().length === 0}>
          Založit a přepnout
        </Button>
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Založit &quot;{name.trim()}&quot; a přepnout se do ní?</DialogTitle>
            <DialogDescription>
              {currentOrgName} → {name.trim()} (nová, prázdná firma). Uvidíš už jen data téhle nové firmy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Zrušit
            </Button>
            <Button onClick={confirmCreate} disabled={submitting}>
              {submitting ? "Zakládám…" : "Ano, založit a přepnout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
