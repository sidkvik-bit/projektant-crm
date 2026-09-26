import { PageHeader } from "@/components/shell/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { updateOwnProfile } from "./actions";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, email")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  return (
    <div>
      <PageHeader
        title="Můj profil"
        description="Jméno, pod kterým vystupuješ v CRM — u vlastníka záznamů, v aktivitách a v notifikacích."
      />
      <div className="p-6">
        <ProfileForm
          initial={{
            first_name: profile?.first_name ?? null,
            last_name: profile?.last_name ?? null,
            email: profile?.email ?? user?.email ?? null,
          }}
          onSave={updateOwnProfile}
        />
      </div>
    </div>
  );
}
