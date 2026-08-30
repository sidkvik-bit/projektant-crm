import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getOrgUserOptions } from "@/engine/users";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { FormEngine } from "@/engine/FormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { CalendarLink, DriveLink } from "@/components/SmartLinks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Project/FormXml/main_form.json";
import { addProjectMilestone, toggleProjectMilestone, deleteProjectMilestone, createMilestoneNotification } from "./actions";
import { updateProject } from "../actions";
import { MilestonesPanel } from "./MilestonesPanel";
import { TeamPanel } from "./TeamPanel";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & { name: string; account_id: string; drive_url: string | null; status: string }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const [common, accounts, contacts, templates, milestones, activityTypes, activities, teamContacts, userOptions, navigatorRecords] =
    await Promise.all([
      getCommonFormContext(supabase, entity as EntityDefinition),
      listRecords<{ id: string; name: string }>(supabase, "accounts", { select: "id, name" }),
      listRecords<{ id: string; first_name: string; last_name: string | null }>(supabase, "contacts", {
        select: "id, first_name, last_name",
      }),
      listRecords<{ id: string; name: string }>(supabase, "project_templates", { select: "id, name" }),
      listRecords<{ id: string; name: string; termin_splneni: string | null; splneno: boolean }>(
        supabase,
        "project_milestones",
        { select: "id, name, termin_splneni, splneno", filter: { project_id: id } },
      ),
      getOptionSetValues(supabase, "activity_type"),
      getTimelineActivities(supabase, { entityType: "Project", entityId: id }),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, profese:option_set_values!contacts_profese_id_fkey(label)")
        .eq("account_id", record.account_id)
        .then((r) => r.data ?? []),
      getOrgUserOptions(supabase),
      listRecords<{ id: string; name: string }>(supabase, "projects", {
        select: "id, name",
        sort: { field: "created_at", direction: "desc" },
      }),
    ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateProject(id, values);
  }

  return (
    <div>
      <PageHeader
        title={record.name}
        badge={{
          label: record.status === "active" ? "Aktivní" : "Neaktivní",
          variant: record.status === "active" ? "default" : "secondary",
        }}
        actions={
          <>
            <CalendarLink title={record.name} />
            <DriveLink url={record.drive_url} />
          </>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Obecné</TabsTrigger>
            <TabsTrigger value="activities">Historie a aktivity</TabsTrigger>
            <TabsTrigger value="team">Tým / Subdodavatelé</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="max-w-5xl space-y-8 pt-4">
            <FormEngine
              entity={entity as EntityDefinition}
              form={formDef as FormDefinition}
              defaultValues={record}
              optionSetValues={common.optionSetValues}
              lookupOptions={{
                ...common.lookupOptions,
                Account: accounts.map((a) => ({ id: a.id, label: a.name })),
                Contact: contacts.map((c) => ({
                  id: c.id,
                  label: [c.first_name, c.last_name].filter(Boolean).join(" "),
                })),
                ProjectTemplate: templates.map((t) => ({ id: t.id, label: t.name })),
              }}
              onSubmit={handleUpdate}
              submitLabel="Uložit změny"
              navigator={{
                viewLabel: entity.displayNamePlural,
                records: navigatorRecords.map((p) => ({ id: p.id, label: p.name })),
              }}
            />

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Úkoly / Milníky</h2>
              <MilestonesPanel
                projectId={id}
                milestones={milestones}
                userOptions={userOptions}
                onAdd={addProjectMilestone}
                onToggle={toggleProjectMilestone}
                onDelete={deleteProjectMilestone}
                onCreateNotification={createMilestoneNotification}
              />
            </div>
          </TabsContent>

          <TabsContent value="activities" className="max-w-3xl pt-4">
            <ActivityTimeline
              entityType="Project"
              entityId={id}
              detailPath={`/projects/${id}`}
              activities={activities}
              activityTypes={activityTypes}
              onAdd={createTimelineActivity}
            />
          </TabsContent>

          <TabsContent value="team" className="pt-4">
            <TeamPanel
              contacts={(teamContacts as unknown as Array<{
                id: string;
                first_name: string;
                last_name: string | null;
                email: string | null;
                profese: { label: string } | null;
              }>).map((c) => ({ ...c, profese: c.profese?.label ?? null }))}
              projectName={record.name}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
