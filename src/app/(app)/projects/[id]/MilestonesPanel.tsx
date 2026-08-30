"use client";

import { useState } from "react";
import { Trash2, Plus, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface Milestone {
  id: string;
  name: string;
  termin_splneni: string | null;
  splneno: boolean;
}

export function MilestonesPanel({
  projectId,
  milestones,
  userOptions,
  onAdd,
  onToggle,
  onDelete,
  onCreateNotification,
}: {
  projectId: string;
  milestones: Milestone[];
  userOptions: UserOption[];
  onAdd: (projectId: string, name: string, terminSplneni: string) => Promise<void>;
  onToggle: (projectId: string, milestoneId: string, splneno: boolean) => Promise<void>;
  onDelete: (projectId: string, milestoneId: string) => Promise<void>;
  onCreateNotification: (
    projectId: string,
    milestoneId: string,
    type: "EMAIL" | "PUSH",
    dniPredem: number,
    recipientUserId: string,
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...milestones].sort((a, b) =>
    (a.termin_splneni ?? "9999").localeCompare(b.termin_splneni ?? "9999"),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím žádné milníky.</p>
        ) : (
          sorted.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={m.splneno}
                  onCheckedChange={(checked) => onToggle(projectId, m.id, Boolean(checked))}
                />
                <div>
                  <p className={m.splneno ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
                    {m.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.termin_splneni ?? "bez termínu"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <NotificationDialog
                  milestoneName={m.name}
                  userOptions={userOptions}
                  onSubmit={(type, dniPredem, recipientUserId) =>
                    onCreateNotification(projectId, m.id, type, dniPredem, recipientUserId)
                  }
                />
                <Button variant="ghost" size="icon-sm" onClick={() => onDelete(projectId, m.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
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

function NotificationDialog({
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
      <DialogTrigger render={<Button variant="ghost" size="icon-sm"><Bell className="size-4" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notifikace — {milestoneName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
            <Label>Dní předem</Label>
            <Input
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
        <DialogFooter>
          <Button
            disabled={submitting || !recipient}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(type, Number(dniPredem) || 0, recipient);
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
