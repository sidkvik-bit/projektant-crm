"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InviteForm({ action }: { action: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
          await action(email);
          setEmail("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Pozvání se nezdařilo.");
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex items-end gap-2"
    >
      <div className="flex-1 space-y-1.5">
        <Input
          type="email"
          placeholder="kolega@firma.cz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Zvu…" : "Pozvat"}
      </Button>
    </form>
  );
}
