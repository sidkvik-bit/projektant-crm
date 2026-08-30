import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";
import { completeOnboarding } from "./actions";

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

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Vítej v Projektant CRM</h1>
          <p className="text-muted-foreground">Nejdřív založíme tvou organizaci.</p>
        </div>
        <OnboardingForm action={completeOnboarding} />
      </div>
    </div>
  );
}
