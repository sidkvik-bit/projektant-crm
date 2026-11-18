"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmInvoice } from "./actions";

export function ConfirmInvoiceButton({ quoteId, itemIds, code }: { quoteId: string; itemIds: string[] | null; code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmInvoice(quoteId, itemIds, code);
            setError(result.error);
          })
        }
      >
        {pending ? "Vystavuji…" : "Vystavit fakturu"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
