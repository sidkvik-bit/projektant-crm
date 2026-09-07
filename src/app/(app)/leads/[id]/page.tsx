import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getRecordById } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { FormEngine } from "@/engine/FormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Lead/FormXml/main_form.json";
import { updateLead } from "../actions";
import { QualifyLeadActions } from "./QualifyLeadActions";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & {
      name: string;
      email: string | null;
      status: string;
      converted_account_id: string | null;
      converted_project_id: string | null;
    }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const [common, leadSourceValues, leadRatingValues, activityTypes, activities] = await Promise.all([
    getCommonFormContext(supabase, entity as EntityDefinition),
    getOptionSetValues(supabase, "lead_source"),
    getOptionSetValues(supabase, "lead_rating"),
    getOptionSetValues(supabase, "activity_type"),
    getTimelineActivities(supabase, { entityType: "Lead", entityId: id }),
  ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateLead(id, values);
  }

  const alreadyQualified = Boolean(record.converted_account_id);
  const resultHref = record.converted_project_id
    ? `/projects/${record.converted_project_id}`
    : `/accounts/${record.converted_account_id}`;

  return (
    <div>
      <PageHeader
        title={record.name}
        badge={{
          label: record.status === "active" ? "Aktivní" : "Neaktivní",
          variant: record.status === "active" ? "default" : "secondary",
        }}
        actions={
          alreadyQualified ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={resultHref}>
                  <ArrowUpRight className="size-4" />
                  Zobrazit výsledek kvalifikace
                </a>
              }
            />
          ) : (
            <QualifyLeadActions leadId={id} />
          )
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <FormEngine
          entity={entity as EntityDefinition}
          form={formDef as FormDefinition}
          defaultValues={record}
          optionSetValues={{
            ...common.optionSetValues,
            lead_source: leadSourceValues,
            lead_rating: leadRatingValues,
          }}
          lookupOptions={common.lookupOptions}
          onSubmit={handleUpdate}
          submitLabel="Uložit změny"
        />

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Historie a aktivity</h2>
          <ActivityTimeline
            entityType="Lead"
            entityId={id}
            detailPath={`/leads/${id}`}
            activities={activities}
            activityTypes={activityTypes}
            onAdd={createTimelineActivity}
            relatedEmail={record.email}
          />
        </div>
      </div>
    </div>
  );
}
