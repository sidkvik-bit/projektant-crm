import { createClient } from "@/lib/supabase/server";
import { FormEngine } from "./FormEngine";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCommonFormContext } from "./formContext";
import { getOptionSetValues, type OptionSetValue } from "./optionSets";
import { listRecords } from "./Database";
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
  /** Klíče dalších číselníků použitých ve formuláři (mimo statusReasonOptionSetKey, kterou řeší getCommonFormContext). */
  extraOptionSetKeys?: string[];
  /** Lookup pole mimo univerzální Owner (ten řeší getCommonFormContext). */
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

  const [common, extraSets, lookupEntries] = await Promise.all([
    getCommonFormContext(supabase, entity),
    Promise.all(extraOptionSetKeys.map((key) => getOptionSetValues(supabase, key))),
    Promise.all(
      extraLookups.map(async (lu) => {
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
  ]);

  const extraOptionSetValues = Object.fromEntries(
    extraOptionSetKeys.map((key, i) => [key, extraSets[i]]),
  ) as Record<string, OptionSetValue[]>;

  return (
    <div>
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
  );
}
