import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";
import { RevokeButton } from "./RevokeButton";
import { inviteMember, revokeInvite } from "./actions";

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: invites } = await supabase
    .from("organization_invites")
    .select("id, email, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Tým</h1>
        <p className="text-muted-foreground">
          Pozvi kolegy e-mailem — při prvním přihlášení přes Google se budou moct připojit k
          téhle organizaci.
        </p>
      </div>

      <InviteForm action={inviteMember} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Čekající pozvánky</h2>
        {invites && invites.length > 0 ? (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span>{invite.email}</span>
              <RevokeButton id={invite.id} action={revokeInvite} />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Žádné čekající pozvánky.</p>
        )}
      </div>
    </div>
  );
}
