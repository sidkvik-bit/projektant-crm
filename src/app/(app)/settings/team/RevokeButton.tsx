"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RevokeButton({
  id,
  action,
}: {
  id: string;
  action: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await action(id);
      }}
    >
      Zrušit
    </Button>
  );
}
