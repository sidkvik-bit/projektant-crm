"use client";

import { Fragment, useState } from "react";
import { Trash2, Plus, Bell, BellPlus, Mail, CheckCircle2, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserOption } from "@/engine/users";

function MilestoneStatusBadge({ splneno, terminSplneni }: { splneno: boolean; terminSplneni: string | null }) {
  if (splneno) return <Badge variant="secondary">Splněno</Badge>;
  if (terminSplneni && terminSplneni < new Date().toISOString().slice(0, 10)) {
    return <Badge variant="destructive">Po termínu</Badge>;
  }
  return <Badge>Aktivní</Badge>;
}

interface Milestone {
  id: string;
  name: string;
  termin_splneni: string | null;
  splneno: boolean;
}

export interface MilestoneNotification {
  id: string;
  type: "EMAIL" | "PUSH";
  dni_predem: number;
  recipientLabel: string;
}

export function MilestonesPanel({
  projectId,
  milestones,
  userOptions,
  notificationsByMilestone,
  onAdd,
  onToggle,
  onDelete,
  onSetDate,
  onBulkDelete,
  onCreateNotification,
  onDeleteNotification,
}: {
  projectId: string;
  milestones: Milestone[];
  userOptions: UserOption[];
  notificationsByMilestone: Record<string, MilestoneNotification[]>;
  onAdd: (projectId: string, name: string, terminSplneni: string) => Promise<void>;
  onToggle: (projectId: string, milestoneId: string, splneno: boolean) => Promise<void>;
  onDelete: (projectId: string, milestoneId: string) => Promise<void>;
  onSetDate: (projectId: string, milestoneId: string, terminSplneni: string | null) => Promise<void>;
  onBulkDelete: (projectId: string, milestoneIds: string[]) => Promise<void>;
  onCreateNotification: (
    projectId: string,
    milestoneId: string,
    type: "EMAIL" | "PUSH",
    dniPredem: number,
    recipientUserId: string,
  ) => Promise<void>;
  onDeleteNotification: (projectId: string, notificationConfigId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [removingNotificationId, setRemovingNotificationId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await onDelete(projectId, deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleRemoveNotification(notificationId: string) {
    setRemovingNotificationId(notificationId);
    try {
      await onDeleteNotification(projectId, notificationId);
    } finally {
      setRemovingNotificationId(null);
    }
  }

  const sorted = [...milestones].sort((a, b) =>
    (a.termin_splneni ?? "9999").localeCompare(b.termin_splneni ?? "9999"),
  );
  const allSelected = sorted.length > 0 && sorted.every((m) => selectedIds.has(m.id));

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => (prev.size === sorted.length ? new Set() : new Set(sorted.map((m) => m.id))));
  }

  async function confirmBulkDelete() {
    setBulkDeleteBusy(true);
    try {
      await onBulkDelete(projectId, Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Vybráno: {selectedIds.size}</span>
          <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="size-4" />
                  Odstranit ({selectedIds.size})
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Odstranit {selectedIds.size} {selectedIds.size === 1 ? "milník" : "milníků"}?</DialogTitle>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteBusy}>
                  Zrušit
                </Button>
                <Button variant="destructive" onClick={confirmBulkDelete} disabled={bulkDeleteBusy}>
                  {bulkDeleteBusy ? "Odstraňuji…" : "Odstranit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odstranit milník &quot;{deleteTarget?.name}&quot;?</DialogTitle>
            <DialogDescription>
              Tuto akci nejde vzít zpět, včetně navázaných notifikací u tohoto milníku.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Odstraňuji…" : "Odstranit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Název
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Termín splnění
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stav
              </TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Zatím žádné milníky.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((m) => {
                const notifications = notificationsByMilestone[m.id] ?? [];
                return (
                  <Fragment key={m.id}>
                    <TableRow className="transition-colors hover:bg-accent/40">
                      <TableCell>
                        <Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleRow(m.id)} />
                      </TableCell>
                      <TableCell className={m.splneno ? "text-muted-foreground line-through" : "font-medium"}>
                        {m.name}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          aria-label={`Termín milníku ${m.name}`}
                          defaultValue={m.termin_splneni ?? ""}
                          className="h-8 w-40"
                          // Ukládá se až při opuštění pole, ne při psaní: datumový input hlásí
                          // změnu zvlášť pro rok, měsíc i den, takže by se při ručním psaní
                          // poslaly tři zápisy s rozepsaným datem.
                          onBlur={(e) => {
                            const next = e.target.value || null;
                            if (next !== (m.termin_splneni ?? null)) onSetDate(projectId, m.id, next);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <MilestoneStatusBadge splneno={m.splneno} terminSplneni={m.termin_splneni} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={m.splneno ? "Zrušit splnění" : "Splnit"}
                            onClick={() => onToggle(projectId, m.id, !m.splneno)}
                          >
                            {m.splneno ? (
                              <XCircle className="size-4 text-muted-foreground" />
                            ) : (
                              <CheckCircle2 className="size-4 text-primary" />
                            )}
                          </Button>
                          <AddNotificationDialog
                            milestoneName={m.name}
                            userOptions={userOptions}
                            onSubmit={(type, dniPredem, recipientUserId) =>
                              onCreateNotification(projectId, m.id, type, dniPredem, recipientUserId)
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Odstranit milník"
                            onClick={() => setDeleteTarget({ id: m.id, name: m.name })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {notifications.map((n) => {
                      const Icon = n.type === "EMAIL" ? Mail : Bell;
                      return (
                        <TableRow key={n.id} className="border-none bg-muted/20 hover:bg-muted/30">
                          <TableCell className="w-8" />
                          <TableCell colSpan={3} className="py-1.5 pl-6 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden className="text-muted-foreground/60">
                                ↳
                              </span>
                              <Icon className="size-3 shrink-0" />
                              {NOTIFICATION_TYPE_LABELS[n.type]} · {n.dni_predem}{" "}
                              {n.dni_predem === 1 ? "den" : n.dni_predem < 5 ? "dny" : "dní"} předem ·{" "}
                              {n.recipientLabel}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Odebrat notifikaci"
                                disabled={removingNotificationId === n.id}
                                onClick={() => handleRemoveNotification(n.id)}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onAdd(projectId, name, date);
            setName("");
            setDate("");
          } finally {
            setSubmitting(false);
          }
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="milestone-name">Název milníku</Label>
          <Input id="milestone-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="milestone-date">Termín splnění</Label>
          <Input id="milestone-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </form>
    </div>
  );
}

const NOTIFICATION_TYPE_LABELS: Record<"EMAIL" | "PUSH", string> = {
  EMAIL: "E-mail",
  PUSH: "Zvoneček (PUSH)",
};

/**
 * Jen založení nové notifikace — výpis už existujících se řeší přímo v tabulce
 * (odsazené řádky pod milníkem), takže tenhle dialog nemusí nic vypisovat.
 */
function AddNotificationDialog({
  milestoneName,
  userOptions,
  onSubmit,
}: {
  milestoneName: string;
  userOptions: UserOption[];
  onSubmit: (type: "EMAIL" | "PUSH", dniPredem: number, recipientUserId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"EMAIL" | "PUSH">("EMAIL");
  const [dniPredem, setDniPredem] = useState("1");
  const [recipient, setRecipient] = useState<string>(userOptions[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Přidat notifikaci">
            <BellPlus className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Přidat notifikaci — {milestoneName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select
                items={{ EMAIL: "E-mail", PUSH: "Zvoneček (PUSH)" }}
                value={type}
                onValueChange={(v) => setType(v as "EMAIL" | "PUSH")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">E-mail</SelectItem>
                  <SelectItem value="PUSH">Zvoneček (PUSH)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notification-dni-predem">Dní předem</Label>
              <Input
                id="notification-dni-predem"
                type="number"
                min={0}
                value={dniPredem}
                onChange={(e) => setDniPredem(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Příjemce</Label>
              <Select
                items={Object.fromEntries(userOptions.map((u) => [u.id, u.label]))}
                value={recipient}
                onValueChange={(v) => setRecipient(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Vyberte…" />
                </SelectTrigger>
                <SelectContent>
                  {userOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={submitting || !recipient}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(type, Number(dniPredem) || 0, recipient);
                setDniPredem("1");
                setOpen(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Uložit notifikaci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
