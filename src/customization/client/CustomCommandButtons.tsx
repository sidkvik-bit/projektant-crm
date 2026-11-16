"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CommandBarButton } from "@/components/shell/CommandBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { runCommandPlugin } from "../actions";
import { customIcon } from "./iconMap";
import type { ResolvedCommand } from "../merge";
import type { HandlerOutcome } from "./useScriptHost";
import { navigate } from "./useScriptHost";
import type { ScriptHandler } from "../types";
import type { ScriptRunContext } from "../sandbox/browserSandbox";

/** {id}, {ids} a {název_pole} v URL tlačítka → hodnoty záznamu (zakódované do URL). */
export function interpolateUrl(template: string, values: Record<string, unknown>, ids: string[]): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name: string) => {
    if (name === "ids") return ids.map(encodeURIComponent).join(",");
    const value = name === "id" ? (values.id ?? ids[0]) : values[name];
    return value === null || value === undefined ? "" : encodeURIComponent(String(value));
  });
}

/**
 * Tlačítka firmy v liště formuláře nebo seznamu. Akce: otevřít URL, spustit funkci
 * klientského skriptu (sandbox), nebo plugin na serveru (událost "command").
 */
export function CustomCommandButtons({
  entity,
  commands,
  recordIds,
  getValues,
  runHandler,
  disabled,
}: {
  entity: string;
  commands: ResolvedCommand[];
  /** Na formuláři [id záznamu], na seznamu vybrané řádky. */
  recordIds: string[];
  getValues: () => Record<string, unknown>;
  runHandler: (handler: ScriptHandler, ctx: ScriptRunContext) => Promise<HandlerOutcome>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<ResolvedCommand | null>(null);

  async function execute(command: ResolvedCommand) {
    setBusy(command.key);
    try {
      const values = getValues();
      const { action } = command;
      if (action.type === "url") {
        navigate(router, interpolateUrl(action.url, values, recordIds), action.newTab);
      } else if (action.type === "script") {
        await runHandler(
          { script: action.script, function: action.function },
          {
            entity,
            recordId: recordIds.length === 1 ? recordIds[0] : ((values.id as string | undefined) ?? null),
            event: { type: "command", command: command.key },
            values,
            selectedIds: recordIds,
          },
        );
      } else {
        const result = await runCommandPlugin(entity, action.plugin, recordIds);
        if (!result.ok) {
          toast.error(result.error);
        } else {
          if (result.value.message) toast.success(result.value.message);
          if (result.value.redirect) navigate(router, result.value.redirect);
          else router.refresh();
        }
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {commands.map((command) => (
        <CommandBarButton
          key={command.key}
          icon={customIcon(command.icon)}
          label={busy === command.key ? `${command.label}…` : command.label}
          disabled={disabled || busy !== null}
          onClick={() => (command.confirm ? setPending(command) : execute(command))}
        />
      ))}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>{pending?.confirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Zrušit
            </Button>
            <Button
              onClick={() => {
                const command = pending;
                setPending(null);
                if (command) void execute(command);
              }}
            >
              Pokračovat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
