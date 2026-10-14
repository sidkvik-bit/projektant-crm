"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface AdminOrganizationRow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  userCount: number;
  accountCount: number;
  projectCount: number;
  isCurrent: boolean;
}

export function AdminOrganizationList({
  organizations,
  action,
}: {
  organizations: AdminOrganizationRow[];
  action: (organizationId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminOrganizationRow | null>(null);
  const [switching, setSwitching] = useState(false);

  const filtered = organizations.filter((org) =>
    org.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

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
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hledat organizaci…"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Žádná organizace neodpovídá hledání.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((org) => (
            <div
              key={org.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {org.name}
                  {org.isCurrent && <Badge variant="secondary">Tady jsi</Badge>}
                  {org.status !== "active" && <Badge variant="destructive">Neaktivní</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {org.userCount} {org.userCount === 1 ? "uživatel" : "uživatelů"} · {org.accountCount} firem ·{" "}
                  {org.projectCount} projektů · založeno {new Date(org.createdAt).toLocaleDateString("cs-CZ")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={org.isCurrent}
                onClick={() => setTarget(org)}
              >
                {org.isCurrent ? "Aktuální" : "Přepnout se sem"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přepnout se do &quot;{target?.name}&quot;?</DialogTitle>
            <DialogDescription>
              Budeš vidět a upravovat data téhle organizace, jako bys do ní patřil/a. Zpátky se
              dostaneš přes tuhle stránku kdykoliv.
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
