"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import type { OptionSetValue } from "@/engine/optionSets";

interface ActivityItem {
  id: string;
  subject: string;
  description: string | null;
  activity_date: string;
  activity_type: string | null;
}

export function ActivitiesPanel({
  projectId,
  activities,
  activityTypes,
  onAdd,
}: {
  projectId: string;
  activities: ActivityItem[];
  activityTypes: OptionSetValue[];
  onAdd: (
    projectId: string,
    subject: string,
    description: string,
    activityTypeId: string | null,
  ) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string>(activityTypes[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím žádné aktivity.</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="rounded-lg border bg-card px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{a.subject}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(a.activity_date).toLocaleString("cs-CZ")}
                </span>
              </div>
              {a.activity_type && (
                <p className="text-xs text-muted-foreground">{a.activity_type}</p>
              )}
              {a.description && <p className="mt-1 text-sm">{a.description}</p>}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onAdd(projectId, subject, description, typeId || null);
            setSubject("");
            setDescription("");
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="activity-description">Popis</Label>
          <Textarea
            id="activity-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="size-4" />
          Přidat aktivitu
        </Button>
      </form>
    </div>
  );
}
