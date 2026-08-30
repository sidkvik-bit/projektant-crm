import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getOrgUserOptions } from "@/engine/users";
import { FormEngine } from "@/engine/FormEngine";
import { PageHeader } from "@/components/shell/PageHeader";
import { CalendarLink, DriveLink } from "@/components/SmartLinks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Project/FormXml/main_form.json";
import {
  addProjectMilestone,
  toggleProjectMilestone,
  deleteProjectMilestone,
  createMilestoneNotification,
  addProjectActivity,
} from "./actions";
import { updateProject } from "../actions";
import { MilestonesPanel } from "./MilestonesPanel";
import { ActivitiesPanel } from "./ActivitiesPanel";
import { TeamPanel } from "./TeamPanel";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & { name: string; account_id: string; drive_url: string | null }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const [common, accounts, contacts, templates, milestones, activityTypes, activities, teamContacts, userOptions] =
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
      supabase
        .from("activities")
        .select("id, subject, description, activity_date, activity_type:option_set_values!activities_activity_type_id_fkey(label)")
        .eq("entity_type", "Project")
        .eq("entity_id", id)
        .order("activity_date", { ascending: false })
        .then((r) => r.data ?? []),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, profese:option_set_values!contacts_profese_id_fkey(label)")
        .eq("account_id", record.account_id)
        .then((r) => r.data ?? []),
      getOrgUserOptions(supabase),
    ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateProject(id, values);
  }

  return (
    <div>
      <PageHeader
        title={record.name}
        actions={
          <>
            <CalendarLink title={record.name} />
            <DriveLink url={record.drive_url} />
          </>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="milestones">
          <TabsList>
            <TabsTrigger value="milestones">Úkoly / Milníky</TabsTrigger>
            <TabsTrigger value="activities">Historie a aktivity</TabsTrigger>
            <TabsTrigger value="team">Tým / Subdodavatelé</TabsTrigger>
            <TabsTrigger value="general">Obecné</TabsTrigger>
          </TabsList>

          <TabsContent value="milestones" className="pt-4">
            <MilestonesPanel
              projectId={id}
              milestones={milestones}
              userOptions={userOptions}
              onAdd={addProjectMilestone}
              onToggle={toggleProjectMilestone}
              onDelete={deleteProjectMilestone}
              onCreateNotification={createMilestoneNotification}
            />
          </TabsContent>

          <TabsContent value="activities" className="pt-4">
            <ActivitiesPanel
              projectId={id}
              activities={(activities as unknown as Array<{
                id: string;
                subject: string;
                description: string | null;
                activity_date: string;
                activity_type: { label: string } | null;
              }>).map((a) => ({
                ...a,
                activity_type: a.activity_type?.label ?? null,
              }))}
              activityTypes={activityTypes}
              onAdd={addProjectActivity}
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

          <TabsContent value="general" className="max-w-3xl pt-4">
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
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
