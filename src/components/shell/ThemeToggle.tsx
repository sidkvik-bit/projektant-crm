"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/** Přepínač Světlý/Tmavý režim — viz ThemeProvider.tsx (default „dark"). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Až po mountu — server vždy vidí jen defaultTheme, dokud next-themes na klientovi
  // nedoběhne (localStorage), jinak by první render neseděl s tím klientským a spadl by
  // do hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : true;
  const Icon = isDark ? Moon : Sun;

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
      <Icon className="size-4 shrink-0 text-sidebar-foreground/70" />
      <Label htmlFor="theme-toggle" className="flex-1 cursor-pointer text-sm font-medium text-sidebar-foreground/70">
        Tmavý režim
      </Label>
      <Switch id="theme-toggle" checked={isDark} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
    </div>
  );
}
