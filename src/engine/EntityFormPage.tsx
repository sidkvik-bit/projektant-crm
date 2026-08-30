import { createClient } from "@/lib/supabase/server";
import { FormEngine } from "./FormEngine";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCommonFormContext } from "./formContext";
import { getOptionSetValues, type OptionSetValue } from "./optionSets";
import { listRecords } from "./Database";
import { RecordNavigator } from "./RecordNavigator";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import type { EntityDefinition, FormDefinition } from "./types";
import type { EntityFormValues } from "./zodSchema";

export interface ExtraLookup {
  /** FieldDefinition.targetEntity, který má formulář referencovat. */
  targetEntity: string;
  table: string;
  /** Sloupce spojené mezerou jako zobrazovací label (např. ["first_name","last_name"]). */
  labelFields: string[];
}

export interface EntityFormPageProps {
  entity: EntityDefinition;
  form: FormDefinition;
  title: string;
  defaultValues?: Partial<EntityFormValues>;
  /**
   * Číselníky a lookupy se pro pole s optionSetKey / targetEntity (přes
   * registry.ts) dopočítávají automaticky. Tyhle propy jsou jen pro výjimky
   * — např. filtrovaný lookup, nebo entitu, co (zatím) není v registry.
   */
  extraOptionSetKeys?: string[];
  extraLookups?: ExtraLookup[];
  onSubmit: (values: EntityFormValues) => Promise<void>;
  submitLabel?: string;
}

export async function EntityFormPage({
  entity,
  form,
  title,
  defaultValues,
  extraOptionSetKeys = [],
  extraLookups = [],
  onSubmit,
  submitLabel = "Uložit",
}: EntityFormPageProps) {
  const supabase = await createClient();

  const autoOptionSetKeys = entity.fields
    .filter((f) => f.type === "optionset" && f.optionSetKey)
    .map((f) => f.optionSetKey as string);

  const autoLookups: ExtraLookup[] = entity.fields
    .filter((f) => f.type === "lookup" && f.targetEntity && entityRegistry[f.targetEntity])
    .map((f) => ({ targetEntity: f.targetEntity as string, ...entityRegistry[f.targetEntity as string] }));

  const optionSetKeys = Array.from(new Set([...autoOptionSetKeys, ...extraOptionSetKeys]));
  const lookups = [
    ...autoLookups,
    ...extraLookups.filter((el) => !autoLookups.some((al) => al.targetEntity === el.targetEntity)),
  ];

  const currentId = defaultValues?.id as string | undefined;
  const selfRegistryEntry = entityRegistry[entity.name];

  const [common, extraSets, lookupEntries, navigatorRecords] = await Promise.all([
    getCommonFormContext(supabase, entity),
    Promise.all(optionSetKeys.map((key) => getOptionSetValues(supabase, key))),
    Promise.all(
      lookups.map(async (lu) => {
        const rows = await listRecords<Record<string, unknown>>(supabase, lu.table, {
          select: `id, ${lu.labelFields.join(", ")}`,
        });
        return [
          lu.targetEntity,
          rows.map((r) => ({
            id: r.id as string,
            label: lu.labelFields.map((f) => r[f]).filter(Boolean).join(" ") || "—",
          })),
        ] as const;
      }),
    ),
    currentId && selfRegistryEntry?.basePath
      ? listRecords<Record<string, unknown>>(supabase, selfRegistryEntry.table, {
          select: `id, ${selfRegistryEntry.labelFields.join(", ")}`,
          sort: { field: "created_at", direction: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const extraOptionSetValues = Object.fromEntries(
    optionSetKeys.map((key, i) => [key, extraSets[i]]),
  ) as Record<string, OptionSetValue[]>;

  return (
    <div className="flex h-full">
      {currentId && selfRegistryEntry?.basePath && (
        <RecordNavigator
          basePath={selfRegistryEntry.basePath}
          currentId={currentId}
          viewLabel={entity.displayNamePlural}
          storageKey={`nav-panel:${entity.name}`}
          records={navigatorRecords.map((r) => ({
            id: r.id as string,
            label: selfRegistryEntry.labelFields.map((f) => r[f]).filter(Boolean).join(" ") || "—",
          }))}
        />
      )}
      <div className="min-w-0 flex-1">
        <PageHeader title={title} />
        <div className="mx-auto max-w-3xl p-6">
          <FormEngine
            entity={entity}
            form={form}
            defaultValues={defaultValues}
            optionSetValues={{ ...common.optionSetValues, ...extraOptionSetValues }}
            lookupOptions={{ ...common.lookupOptions, ...Object.fromEntries(lookupEntries) }}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
          />
        </div>
      </div>
    </div>
  );
}
