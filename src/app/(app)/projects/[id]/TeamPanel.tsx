import { EmailLink } from "@/components/SmartLinks";

interface TeamContact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  profese: string | null;
}

export function TeamPanel({ contacts, projectName }: { contacts: TeamContact[]; projectName: string }) {
  if (contacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Klient tohoto projektu zatím nemá žádné kontakty (subdodavatele/profese).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">
              {c.first_name} {c.last_name}
            </p>
            {c.profese && <p className="text-xs text-muted-foreground">{c.profese}</p>}
          </div>
          <EmailLink email={c.email} subject={projectName} />
        </div>
      ))}
    </div>
  );
}
