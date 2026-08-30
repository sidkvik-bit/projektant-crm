import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { JoinOrganizationList } from "./JoinOrganizationList";
import { completeOnboarding, joinOrganization } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefs) redirect("/leads");

  // RLS omezuje výsledek striktně na pozvánky adresované mému ověřenému e-mailu.
  const { data: invites } = await supabase
    .from("organization_invites")
    .select("organization_id, organizations(id, name)");

  const invitedOrgs = (invites ?? [])
    .map((invite) => invite.organizations as unknown as { id: string; name: string } | null)
    .filter((org): org is { id: string; name: string } => org !== null);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Vítej v Projektant CRM</h1>
          <p className="text-muted-foreground">
            {invitedOrgs.length > 0
              ? "Byl jsi pozván do některé z těchto organizací, nebo si můžeš založit vlastní."
              : "Nejdřív založíme tvou organizaci."}
          </p>
        </div>

        {invitedOrgs.length > 0 && (
          <JoinOrganizationList organizations={invitedOrgs} action={joinOrganization} />
        )}

        <div className="space-y-3">
          {invitedOrgs.length > 0 && (
            <h2 className="text-sm font-medium text-muted-foreground">Nebo založ novou firmu</h2>
          )}
          <OnboardingForm action={completeOnboarding} />
        </div>
      </div>
    </div>
  );
}
