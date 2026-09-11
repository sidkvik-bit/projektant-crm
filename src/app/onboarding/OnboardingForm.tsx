"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm({
  action,
}: {
  action: (organizationName: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        await action(name);
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="organizationName">Název firmy</Label>
        <Input
          id="organizationName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>
      <Button type="submit" disabled={submitting || name.trim().length === 0}>
        {submitting ? "Zakládám…" : "Založit organizaci"}
      </Button>
    </form>
  );
}
