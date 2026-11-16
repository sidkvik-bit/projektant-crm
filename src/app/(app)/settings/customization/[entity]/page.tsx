import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { baseCatalog } from "@/solutions/Projektant_CRM/catalog";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import { defaultCustomForm, defaultCustomViews } from "@/customization/merge";
import { customEntityBasePath } from "@/customization/registry";
import { loadStudio, studioEntities, type StudioComponent } from "@/customization/studio";
import { COMPONENT_TEMPLATES } from "@/customization/templates";
import { draftEntity } from "@/customization/validation";
import type { ComponentType, CustomEntityDef, CustomFieldDef } from "@/customization/types";
import { ComponentActions } from "../_components/ComponentActions";
import { ComponentEditorDialog } from "../_components/ComponentEditorDialog";
import { EntityDialog } from "../_components/EntityDialog";
import { FieldDialog, FIELD_TYPE_LABELS } from "../_components/FieldDialog";
import { StatusBadge } from "../_components/StatusBadge";

export default async function CustomizationEntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: name } = await params;
  const supabase = await createClient();
  const state = await loadStudio(supabase);
  const entityComponent = state.components.find((c) => c.type === "entity" && c.key === name);
  const base = baseCatalog[name];
  if (!base && !entityComponent) notFound();

  const entity = draftEntity(name, state.draft);
  const of = (type: ComponentType) => state.components.filter((c) => c.type === type && c.entity === name);
  const { data: optionSets } = await supabase.from("option_sets").select("key, label").order("label");
  const lookupTargets = studioEntities(state).map(({ name: n, label }) => ({ name: n, label }));

  const baseForm = base?.form ?? (entity ? defaultCustomForm(entity) : null);
  const baseViews = base?.views ?? (entity ? defaultCustomViews(entity) : []);
  const formComponent = of("form").find((c) => c.key === "main");
  const appPath = entityRegistry[name]?.basePath ?? customEntityBasePath(name);
  const title =
    base?.entity.displayNamePlural ?? (entityComponent?.current as CustomEntityDef | undefined)?.displayNamePlural ?? name;

  return (
    <div>
      <PageHeader
        title={`Přizpůsobení — ${title}`}
        description={`${name}${base ? " · entita základního řešení" : " · vlastní entita firmy"}`}
        actions={
          <Button variant="outline" size="sm" render={<Link href={appPath} />}>
            Otevřít v aplikaci <ArrowUpRight className="size-4" />
          </Button>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="fields">
          <TabsList className="flex-wrap">
            {entityComponent && <TabsTrigger value="entity">Entita</TabsTrigger>}
            <TabsTrigger value="fields">Pole</TabsTrigger>
            <TabsTrigger value="form">Formulář</TabsTrigger>
            <TabsTrigger value="views">Pohledy</TabsTrigger>
            <TabsTrigger value="commands">Tlačítka</TabsTrigger>
            <TabsTrigger value="scripts">Skripty</TabsTrigger>
            <TabsTrigger value="plugins">Pluginy</TabsTrigger>
          </TabsList>

          {entityComponent && (
            <TabsContent value="entity" className="space-y-3 pt-4">
              <ComponentRow component={entityComponent} label={name}>
                {entityComponent.status !== "deleted" && (
                  <EntityDialog
                    existing={{ key: name, definition: entityComponent.current as CustomEntityDef }}
                    trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                  />
                )}
              </ComponentRow>
              <p className="text-sm text-muted-foreground">
                Smazání entity skryje její seznam i formulář. Záznamy v databázi zůstanou — po obnovení entity se zase
                ukážou.
              </p>
            </TabsContent>
          )}

          <TabsContent value="fields" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <FieldDialog
                entity={name}
                entities={lookupTargets}
                optionSets={optionSets ?? []}
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" /> Nové pole
                  </Button>
                }
              />
            </div>
            <div className="space-y-2">
              {of("field").map((c) => {
                const def = c.current as CustomFieldDef | null;
                return (
                  <ComponentRow
                    key={c.key}
                    component={c}
                    label={def?.label ?? c.key}
                    detail={def ? FIELD_TYPE_LABELS[def.type] : undefined}
                  >
                    {c.status !== "deleted" && def && (
                      <FieldDialog
                        entity={name}
                        existing={{ key: c.key, definition: def }}
                        entities={lookupTargets}
                        optionSets={optionSets ?? []}
                        trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                      />
                    )}
                  </ComponentRow>
                );
              })}
            </div>
            {base && (
              <details className="rounded-lg border bg-card p-3 text-sm">
                <summary className="cursor-pointer font-medium">Pole základního řešení ({base.entity.fields.length})</summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {base.entity.fields.map((f) => (
                    <li key={f.name}>
                      {f.label} <code className="text-xs text-muted-foreground">{f.name}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </TabsContent>

          <TabsContent value="form" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Přepis hlavního formuláře: <code>tabs</code> nahradí rozložení, <code>events</code> napojí skripty na onLoad /
              onChange / onSave. Bez <code>tabs</code> zůstane rozložení základu.
            </p>
            {formComponent ? (
              <ComponentRow component={formComponent} label="Formulář">
                {formComponent.status !== "deleted" && (
                  <ComponentEditorDialog
                    type="form"
                    entity={name}
                    componentKey="main"
                    initial={formComponent.current}
                    trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                  />
                )}
              </ComponentRow>
            ) : (
              <div className="flex flex-wrap gap-2">
                <ComponentEditorDialog
                  type="form"
                  entity={name}
                  fixedKey="main"
                  initial={COMPONENT_TEMPLATES.form}
                  trigger={<Button size="sm" variant="outline">Přidat jen události (skripty)</Button>}
                />
                {baseForm && (
                  <ComponentEditorDialog
                    type="form"
                    entity={name}
                    fixedKey="main"
                    initial={{ columns: baseForm.columns ?? 2, tabs: baseForm.tabs, events: {} }}
                    trigger={<Button size="sm" variant="outline">Upravit rozložení</Button>}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="views" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <ComponentEditorDialog
                type="view"
                entity={name}
                initial={COMPONENT_TEMPLATES.view}
                keyHint="napr_po_terminu"
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" /> Nový pohled
                  </Button>
                }
              />
            </div>
            <div className="space-y-2">
              {baseViews.map((v) => {
                const change = of("view").find((c) => c.key === v.name);
                return change ? (
                  <ComponentRow key={v.name} component={change} label={v.label} detail="pohled základu — upravený">
                    {change.status !== "deleted" && (
                      <ComponentEditorDialog
                        type="view"
                        entity={name}
                        componentKey={v.name}
                        initial={change.current}
                        trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                      />
                    )}
                  </ComponentRow>
                ) : (
                  <div key={v.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                    <div className="text-sm">
                      {v.label} <code className="text-xs text-muted-foreground">{v.name}</code>{" "}
                      <span className="text-xs text-muted-foreground">· základ</span>
                    </div>
                    <div className="flex gap-1">
                      <ComponentEditorDialog
                        type="view"
                        entity={name}
                        fixedKey={v.name}
                        initial={{ label: v.label }}
                        trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                      />
                      <ComponentEditorDialog
                        type="view"
                        entity={name}
                        fixedKey={v.name}
                        initial={{ hidden: true }}
                        trigger={<Button size="sm" variant="ghost">Skrýt</Button>}
                      />
                    </div>
                  </div>
                );
              })}
              {of("view")
                .filter((c) => !baseViews.some((v) => v.name === c.key))
                .map((c) => (
                  <ComponentRow key={c.key} component={c} label={(c.current as { label?: string } | null)?.label ?? c.key}>
                    {c.status !== "deleted" && (
                      <ComponentEditorDialog
                        type="view"
                        entity={name}
                        componentKey={c.key}
                        initial={c.current}
                        trigger={<Button size="sm" variant="ghost">Upravit</Button>}
                      />
                    )}
                  </ComponentRow>
                ))}
            </div>
          </TabsContent>

          <ComponentListTab
            value="commands"
            type="command"
            entity={name}
            components={of("command")}
            description="Tlačítka v liště formuláře (location: form) nebo seznamu (location: list). Akce: url, script (klientský skript), plugin (serverový plugin s událostí command)."
            newLabel="Nové tlačítko"
            keyHint="napr_vytvorit_nabidku"
          />
          <ComponentListTab
            value="scripts"
            type="script"
            entity={name}
            components={of("script")}
            description="Klientské skripty — běží v prohlížeči v sandboxu. Napoj je ve Formuláři (events) nebo na tlačítko."
            newLabel="Nový skript"
            keyHint="napr_formular"
          />
          <ComponentListTab
            value="plugins"
            type="plugin"
            entity={name}
            components={of("plugin")}
            description="Serverové pluginy — běží při vytvoření / uložení / smazání záznamu, nebo z tlačítka. Můžou měnit hodnoty, zastavit uložení chybou a zakládat další záznamy."
            newLabel="Nový plugin"
            keyHint="napr_kontrola_ico"
          />
        </Tabs>
      </div>
    </div>
  );
}

function ComponentRow({
  component,
  label,
  detail,
  children,
}: {
  component: StudioComponent;
  label: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{label}</span>
          <code className="text-xs text-muted-foreground">{component.key}</code>
          {detail && <span className="text-xs text-muted-foreground">· {detail}</span>}
          <StatusBadge status={component.status} />
        </div>
        {component.error && (
          <p className="text-xs text-destructive">Neplatná definice — v aplikaci se přeskočí: {component.error}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {children}
        <ComponentActions
          type={component.type}
          entity={component.entity}
          componentKey={component.key}
          status={component.status}
          label={label}
        />
      </div>
    </div>
  );
}

function ComponentListTab({
  value,
  type,
  entity,
  components,
  description,
  newLabel,
  keyHint,
}: {
  value: string;
  type: "command" | "script" | "plugin";
  entity: string;
  components: StudioComponent[];
  description: string;
  newLabel: string;
  keyHint: string;
}) {
  const labelOf = (c: StudioComponent) => {
    const def = c.current as { label?: string; description?: string } | null;
    return def?.label ?? def?.description ?? c.key;
  };
  return (
    <TabsContent value={value} className="space-y-4 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        <ComponentEditorDialog
          type={type}
          entity={entity}
          initial={COMPONENT_TEMPLATES[type]}
          keyHint={keyHint}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> {newLabel}
            </Button>
          }
        />
      </div>
      <div className="space-y-2">
        {components.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Zatím žádné.</p>
        )}
        {components.map((c) => (
          <ComponentRow key={c.key} component={c} label={labelOf(c)}>
            {c.status !== "deleted" && (
              <ComponentEditorDialog
                type={type}
                entity={entity}
                componentKey={c.key}
                initial={c.current}
                trigger={<Button size="sm" variant="ghost">Upravit</Button>}
              />
            )}
          </ComponentRow>
        ))}
      </div>
    </TabsContent>
  );
}
