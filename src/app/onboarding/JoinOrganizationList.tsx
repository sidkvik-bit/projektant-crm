"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Organization {
  id: string;
  name: string;
}

export function JoinOrganizationList({
  organizations,
  action,
}: {
  organizations: Organization[];
  action: (organizationId: string) => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {organizations.map((org) => (
        <div
          key={org.id}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <span className="font-medium">{org.name}</span>
          <Button
            size="sm"
            disabled={pendingId !== null}
            onClick={async () => {
              setPendingId(org.id);
              await action(org.id);
            }}
          >
            {pendingId === org.id ? "Připojuji…" : "Připojit se"}
          </Button>
        </div>
      ))}
    </div>
  );
}
