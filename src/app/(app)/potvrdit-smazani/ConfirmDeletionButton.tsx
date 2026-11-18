"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmDeletion } from "./actions";

export function ConfirmDeletionButton({ entity, id, code }: { entity: string; id: string; code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmDeletion(entity, id, code);
            setError(result.error);
          })
        }
      >
        {pending ? "Mažu…" : "Smazat"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
