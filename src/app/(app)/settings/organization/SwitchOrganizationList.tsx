"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Organization {
  id: string;
  name: string;
}

/** Na rozdíl od stejnojmenné komponenty v onboardingu (nová osoba, žádná data v sázce) tahle
 * potvrzuje přepnutí dialogem — existující uživatel přechodem opustí kontext svojí současné
 * firmy, viz [[feedback-confirmation-dialogs]]. */
export function SwitchOrganizationList({
  organizations,
  currentOrgName,
  action,
}: {
  organizations: Organization[];
  currentOrgName: string;
  action: (organizationId: string) => Promise<void>;
}) {
  const [target, setTarget] = useState<Organization | null>(null);
  const [switching, setSwitching] = useState(false);

  async function confirmSwitch() {
    if (!target) return;
    setSwitching(true);
    try {
      await action(target.id);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-2">
      {organizations.map((org) => (
        <div key={org.id} className="flex items-center justify-between rounded-lg border p-3">
          <span className="font-medium">{org.name}</span>
          <Button size="sm" variant="outline" onClick={() => setTarget(org)}>
            Přepnout
          </Button>
        </div>
      ))}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přepnout na &quot;{target?.name}&quot;?</DialogTitle>
            <DialogDescription>
              {currentOrgName} → {target?.name}. Uvidíš už jen data téhle firmy — svoje předchozí
              pozvánky si kdykoliv necháš poslat znovu, pokud se budeš chtít vrátit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={switching}>
              Zrušit
            </Button>
            <Button onClick={confirmSwitch} disabled={switching}>
              {switching ? "Přepínám…" : "Ano, přepnout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
