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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { USER_ROLES, type UserRole } from "@/lib/userRoles";

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
const CUSTOMIZER = "System Customizer";

const ROLE_EFFECT: Record<UserRole, string> = {
  "Basic User": "Bude appku jen používat — bez admin sekce a bez úprav firmy.",
  "System Customizer":
    "Smí upravovat svou firmu: vlastní pole, entity, formuláře, pohledy, tlačítka, skripty a pluginy. Admin sekci neuvidí.",
  "Platform Superadmin": "Získá přístup do admin sekce, uvidí data všech organizací a smí upravovat i firmy.",
};

export function AdminUserList({
  users,
  action,
}: {
  users: AdminUserRow[];
  action: (userId: string, role: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ user: AdminUserRow; role: UserRole } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = users.filter((user) =>
    `${user.name} ${user.email ?? ""} ${user.organizationName}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function confirmRoleChange() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await action(target.user.userId, target.role);
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
                  {user.role === CUSTOMIZER && <Badge variant="secondary">{CUSTOMIZER}</Badge>}
                  {user.isSelf && <Badge variant="secondary">To jsi ty</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user.email ?? "—"} · {user.organizationName}
                </p>
              </div>
              <Select
                items={Object.fromEntries(USER_ROLES.map((r) => [r, r]))}
                value={user.role}
                onValueChange={(role) => role && role !== user.role && setTarget({ user, role: role as UserRole })}
              >
                <SelectTrigger size="sm" className="w-48" aria-label={`Role uživatele ${user.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Změnit roli uživatele {target?.user.name}?</DialogTitle>
            <DialogDescription>
              {target?.user.role} → {target?.role}. {target && ROLE_EFFECT[target.role]}
              {target?.user.isSelf &&
                target.role !== SUPERADMIN &&
                " Tímhle si sám/sama odebereš přístup do admin sekce."}
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
