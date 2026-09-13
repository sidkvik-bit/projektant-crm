"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export interface AdminUserRow {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  organizationName: string;
  createdAt: string;
  isSelf: boolean;
}

const SUPERADMIN = "Platform Superadmin";
const BASIC = "Basic User";

export function AdminUserList({
  users,
  action,
}: {
  users: AdminUserRow[];
  action: (userId: string, role: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = users.filter((user) =>
    `${user.name} ${user.email ?? ""} ${user.organizationName}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const nextRole = target?.role === SUPERADMIN ? BASIC : SUPERADMIN;

  async function confirmRoleChange() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await action(target.userId, nextRole);
      setTarget(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Změna role se nezdařila.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hledat podle jména, e-mailu nebo organizace…"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Žádný uživatel neodpovídá hledání.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => (
            <div
              key={user.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {user.name}
                  {user.role === SUPERADMIN && <Badge>{SUPERADMIN}</Badge>}
                  {user.isSelf && <Badge variant="secondary">To jsi ty</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user.email ?? "—"} · {user.organizationName}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTarget(user)}>
                {user.role === SUPERADMIN ? "Odebrat superadmina" : "Udělat superadmina"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Změnit roli uživatele {target?.name}?</DialogTitle>
            <DialogDescription>
              {target?.role} → {nextRole}.{" "}
              {nextRole === SUPERADMIN
                ? "Získá přístup do admin sekce a uvidí data všech organizací."
                : "Ztratí přístup do admin sekce a bude vidět jen svoji organizaci."}
              {target?.isSelf && nextRole === BASIC && " Tímhle si sám/sama odebereš přístup do admin sekce."}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={saving}>
              Zrušit
            </Button>
            <Button onClick={confirmRoleChange} disabled={saving}>
              {saving ? "Měním…" : "Ano, změnit roli"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
