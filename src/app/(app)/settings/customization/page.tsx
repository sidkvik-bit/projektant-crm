import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { isPreviewMode } from "@/customization/repository";
import { loadStudio, studioEntities } from "@/customization/studio";
import { COMPONENT_TEMPLATES } from "@/customization/templates";
import { StudioToolbar } from "./_components/StudioToolbar";
import { EntityDialog } from "./_components/EntityDialog";
import { ComponentEditorDialog } from "./_components/ComponentEditorDialog";
import { StatusBadge } from "./_components/StatusBadge";
import { ComponentActions } from "./_components/ComponentActions";

export default async function CustomizationPage() {
  const supabase = await createClient();
  const [state, preview] = await Promise.all([loadStudio(supabase), isPreviewMode()]);
  const entities = studioEntities(state);
  const sharedScripts = state.components.filter((c) => c.type === "script" && c.entity === "*");
  const countFor = (entity: string) => state.components.filter((c) => c.entity === entity).length;
  const pendingFor = (entity: string) => state.components.filter((c) => c.entity === entity && c.status !== "published").length;

  return (
    <div>
      <PageHeader
        title="Přizpůsobení"
        description="Vrstva úprav tvé firmy nad základní aplikací — pole, entity, formuláře, pohledy, tlačítka, skripty a pluginy. Změny se ukládají jako rozpracované a uživatelé je uvidí až po publikování."
        actions={<StudioToolbar preview={preview} pendingCount={state.pendingCount} />}
      />
      <div className="space-y-8 p-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Entity</h2>
            <EntityDialog
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  Nová entita
                </Button>
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entities.map((e) => (
              <Link
                key={e.name}
                href={`/settings/customization/${e.name}`}
                className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
              >
                <p className="font-medium">{e.label}</p>
                <p className="text-xs text-muted-foreground">
                  {e.name} · {e.custom ? "vlastní entita" : "základ"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {countFor(e.name)} úprav{pendingFor(e.name) ? ` · ${pendingFor(e.name)} nepublikovaných` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Sdílené skripty</h2>
              <p className="text-sm text-muted-foreground">Klientské skripty použitelné ve formulářích a tlačítkách všech entit.</p>
            </div>
            <ComponentEditorDialog
              type="script"
              entity="*"
              initial={COMPONENT_TEMPLATES.script}
              keyHint="napr_spolecne"
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  Nový skript
                </Button>
              }
            />
          </div>
          {sharedScripts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Zatím žádné.</p>
          ) : (
            <div className="space-y-2">
              {sharedScripts.map((c) => (
                <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code className="text-sm">{c.key}</code>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-1">
                    {c.status !== "deleted" && (
                      <ComponentEditorDialog
                        type="script"
                        entity="*"
                        componentKey={c.key}
                        initial={c.current}
                        trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                      />
                    )}
                    <ComponentActions type="script" entity="*" componentKey={c.key} status={c.status} label={c.key} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
