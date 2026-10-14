"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  initial,
  onSave,
}: {
  initial: { first_name: string | null; last_name: string | null; email: string | null };
  onSave: (firstName: string, lastName: string) => Promise<void>;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(firstName, lastName);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-first">Jméno</Label>
          <Input id="profile-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-last">Příjmení</Label>
          <Input id="profile-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-email">E-mail</Label>
        <Input id="profile-email" value={initial.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground">
          E-mail je přihlašovací údaj a mění se přes Google, ne tady.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Ukládám…" : "Uložit"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Uloženo.</span>}
      </div>
    </form>
  );
}
