import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUserName } from "@/engine/users";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { signOut, markNotificationRead } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, email, avatar_url, organizations(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, message, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const displayName = formatUserName(profile) || user.email || "Uživatel";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const organization = profile.organizations as unknown as { name: string } | null;

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar organizationName={organization?.name ?? ""} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={{
            name: displayName,
            email: profile.email,
            avatarUrl: profile.avatar_url,
            initials: initials || "?",
          }}
          notifications={notifications ?? []}
          onSignOut={signOut}
          onMarkRead={markNotificationRead}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
