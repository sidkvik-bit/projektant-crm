"use client";

import { useRef, useState } from "react";
import { Phone, Mail, CalendarDays, StickyNote, Activity as ActivityIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmailLink, CalendarLink } from "@/components/SmartLinks";
import type { OptionSetValue } from "./optionSets";
import type { TimelineActivity } from "./activities";

const TYPE_ICONS: Record<string, typeof Phone> = {
  Telefonát: Phone,
  "E-mail": Mail,
  Schůzka: CalendarDays,
  Poznámka: StickyNote,
};

function iconFor(label: string | null) {
  return (label && TYPE_ICONS[label]) || ActivityIcon;
}

function nowForDatetimeInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Znovupoužitelná timeline aktivit pro libovolnou entitu (entity_type/entity_id
 * polymorfní vazba) — použij na detailu Projektu, Firmy, Kontaktu, Zájemce atd.
 * Kvůli tomu je založená na TimelineActivity/createTimelineActivity z activities.ts
 * a entityActions.ts, ne na entitně-specifickém kódu.
 */
export function ActivityTimeline({
  entityType,
  entityId,
  detailPath,
  activities,
  activityTypes,
  onAdd,
  relatedEmail,
}: {
  entityType: string;
  entityId: string;
  detailPath: string;
  activities: TimelineActivity[];
  activityTypes: OptionSetValue[];
  onAdd: (
    entityType: string,
    entityId: string,
    detailPath: string,
    subject: string,
    description: string,
    activityTypeId: string | null,
    activityDate: string,
  ) => Promise<void>;
  /** Pokud entita má e-mail (Kontakt, Zájemce, Firma) — zobrazí zkratky Napsat e-mail / Nová schůzka. */
  relatedEmail?: string | null;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string>("");
  const [activityDate, setActivityDate] = useState(nowForDatetimeInput());
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);

  function openForm(typeLabel?: string) {
    if (typeLabel) {
      const match = activityTypes.find((t) => t.label === typeLabel);
      setTypeId(match?.id ?? "");
    }
    setActivityDate(nowForDatetimeInput());
    setFormOpen(true);
    requestAnimationFrame(() => subjectRef.current?.focus());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["Telefonát", "E-mail", "Schůzka", "Poznámka"].map((label) => {
          const Icon = iconFor(label);
          return (
            <Button key={label} variant="outline" size="sm" onClick={() => openForm(label)}>
              <Icon className="size-4" />
              {label}
            </Button>
          );
        })}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Aktivita se nejdřív uloží; teprve pak jde reálně odeslat e-mailem / do kalendáře — tlačítko
        se objeví u uloženého záznamu.
      </p>

      {formOpen ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              await onAdd(entityType, entityId, detailPath, subject, description, typeId || null, activityDate);
              setSubject("");
              setDescription("");
              setTypeId("");
              setFormOpen(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-2 rounded-lg border p-3"
        >
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="activity-subject">Předmět</Label>
              <Input
                id="activity-subject"
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="w-48 space-y-1.5">
              <Label>Typ</Label>
              <Select
                items={Object.fromEntries(activityTypes.map((t) => [t.id, t.label]))}
                value={typeId}
                onValueChange={(v) => setTypeId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Vyberte…" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48 space-y-1.5">
              <Label htmlFor="activity-date">Datum</Label>
              <Input
                id="activity-date"
                type="datetime-local"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-description">Popis</Label>
            <Textarea
              id="activity-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Ukládám…" : "Uložit aktivitu"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} disabled={submitting}>
              Zrušit
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => openForm()}>
          <Plus className="size-4" />
          Jiná aktivita
        </Button>
      )}

      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím žádné aktivity.</p>
        ) : (
          activities.map((a) => {
            const Icon = iconFor(a.activity_type);
            return (
              <div key={a.id} className="flex gap-3 rounded-lg border bg-card px-3 py-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.subject}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(a.activity_date).toLocaleString("cs-CZ")}
                    </span>
                  </div>
                  {a.activity_type && <p className="text-xs text-muted-foreground">{a.activity_type}</p>}
                  {a.description && <p className="mt-1 text-sm">{a.description}</p>}
                  {relatedEmail && a.activity_type === "E-mail" && (
                    <div className="mt-2">
                      <EmailLink email={relatedEmail} subject={a.subject} body={a.description} label="Odeslat v Gmailu" />
                    </div>
                  )}
                  {a.activity_type === "Schůzka" && (
                    <div className="mt-2">
                      <CalendarLink
                        title={a.subject}
                        guestEmail={relatedEmail}
                        details={a.description}
                        label="Otevřít v Kalendáři"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
