import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { RootFolderForm } from "./RootFolderForm";

export default async function GoogleDriveSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("organizations(drive_root_folder_url)")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const org = profile?.organizations as unknown as { drive_root_folder_url: string | null } | null;

  return (
    <div>
      <PageHeader
        title="Google Drive"
        description="Root složka, pod kterou se zakládají podsložky jednotlivých projektů."
      />
      <div className="p-6">
        <RootFolderForm initialUrl={org?.drive_root_folder_url ?? null} />
      </div>
    </div>
  );
}
