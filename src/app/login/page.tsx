"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const supabase = createClient();

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Projektant CRM</h1>
        <Button onClick={handleLogin}>Přihlásit se přes Google</Button>
      </div>
    </div>
  );
}
