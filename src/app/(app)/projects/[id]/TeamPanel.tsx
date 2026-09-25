"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmailLink } from "@/components/SmartLinks";

export interface TeamMember {
  /** id řádku vazby, ne kontaktu — tím se maže */
  id: string;
  contactId: string;
  name: string;
  email: string | null;
  role: string | null;
}

export interface TeamOption {
  id: string;
  label: string;
}

/**
 * Tým projektu. Na rozdíl od dřívějška to nejsou kontakty klientovy firmy, ale vlastní vazba —
 * takže sem patří i statik nebo geodet z úplně jiné firmy, což dřív nešlo.
 *
 * Panel je vlastní, ne přes formulářový engine, stejně jako milníky: podřízené řádky se editují
 * v kontextu projektu, ne na samostatné stránce.
 */
export function TeamPanel({
  projectId,
  members,
  contactOptions,
  roleOptions,
  onAdd,
  onRemove,
}: {
  projectId: string;
  members: TeamMember[];
  contactOptions: TeamOption[];
  roleOptions: TeamOption[];
  onAdd: (projectId: string, contactId: string, roleId: string | null) => Promise<void>;
  onRemove: (projectId: string, memberId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyIn = new Set(members.map((m) => m.contactId));
  const available = contactOptions.filter((c) => !alreadyIn.has(c.id));

  async function handleAdd() {
    if (!contactId) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(projectId, contactId, roleId || null);
      setContactId("");
      setRoleId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přidání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await onRemove(projectId, removing.id);
      setRemoving(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="teamContact">Kontakt</Label>
          <Select value={contactId} onValueChange={(v) => setContactId(v ?? "")}>
            <SelectTrigger id="teamContact">
              <SelectValue placeholder="Vyber osobu…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1.5">
          <Label htmlFor="teamRole">Role</Label>
          <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "")}>
            <SelectTrigger id="teamRole">
              <SelectValue placeholder="Bez role" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} disabled={busy || !contactId}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          K projektu zatím nikdo není přiřazený. Přidej investora, statika, geodeta nebo kohokoliv
          dalšího — nemusí pracovat u klienta.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Link href={`/contacts/${m.contactId}`} className="text-sm font-medium hover:underline">
                  {m.name}
                </Link>
                {m.role && <p className="text-xs text-muted-foreground">{m.role}</p>}
              </div>
              <div className="flex items-center gap-2">
                <EmailLink email={m.email} label="Napsat" />
                <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(m)} title="Odebrat z týmu">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odebrat {removing?.name} z týmu?</DialogTitle>
            <DialogDescription>
              Kontakt zůstane v CRM i se všemi aktivitami — odebere se jen jeho přiřazení k tomuhle
              projektu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={busy}>
              {busy ? "Odebírám…" : "Ano, odebrat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
