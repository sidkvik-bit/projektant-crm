"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPreviewMode } from "../studioActions";

/** Lišta nad stránkou, když si customizer zapnul náhled rozpracovaných úprav. */
export function PreviewBanner() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <Eye className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Náhled rozpracovaných úprav — vidíš i nepublikované změny. Ostatní uživatelé je zatím nevidí.
      </span>
      <Button variant="outline" size="sm" render={<Link href="/settings/customization/publish" />}>
        Publikovat…
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(() => setPreviewMode(false))}>
        Ukončit náhled
      </Button>
    </div>
  );
}
