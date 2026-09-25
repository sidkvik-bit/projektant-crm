"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { googleOAuthOptions } from "@/lib/googleOAuthOptions";

function LoginForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  async function handleLogin() {
    // Proxy sem posílá `next` s původní cestou (typicky /oauth/authorize s parametry klienta),
    // ať uživatel po přihlášení pokračuje tam, kam mířil. /auth/callback si ho ověřuje jako
    // relativní cestu, takže se přes něj nedá odejít na cizí web.
    const next = searchParams.get("next");
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: googleOAuthOptions(callback.toString()),
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">ProjektantCRM</h1>
        <Button onClick={handleLogin}>Přihlásit se přes Google</Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams potřebuje Suspense hranici, jinak si Next vynutí client-side rendering
  // celé stránky při buildu.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
