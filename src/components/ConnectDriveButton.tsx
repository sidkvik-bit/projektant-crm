"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { googleOAuthOptions } from "@/lib/googleOAuthOptions";

/**
 * Dodatečné připojení Google Drive ke stávající relaci — pro uživatele, co se přihlásili
 * ještě předtím, než login začal žádat o Drive scope. Znovu proběhne Google consent
 * (access_type=offline&prompt=consent), a `next` pošle uživatele zpátky přesně tam,
 * odkud tlačítko zmáčkl (viz auth/callback/route.ts).
 */
export function ConnectDriveButton() {
  const pathname = usePathname();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(pathname)}`;
    await supabase.auth.signInWithOAuth({ provider: "google", options: googleOAuthOptions(redirectTo) });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleConnect} disabled={connecting}>
      <HardDrive className="size-4" />
      {connecting ? "Přesměrovávám…" : "Připojit Google Drive"}
    </Button>
  );
}
