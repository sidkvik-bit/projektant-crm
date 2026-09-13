"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Kopírovatelný blok kódu/textu pro copy-paste kroky v návodu (Admin Console cesta, SQL
 * skript…) — stejný "zkopírováno" vzor jako PrefillFormButton. */
export function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative rounded-lg border bg-muted/40">
      {label && <p className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</p>}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 pr-12 text-xs">{text}</pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2"
        onClick={handleCopy}
        title="Kopírovat"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
