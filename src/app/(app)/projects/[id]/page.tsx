import { notFound } from "next/navigation";
import Link from "next/link";
import { Receipt, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getOrgUserOptions, formatUserName } from "@/engine/users";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { FormEngine } from "@/engine/FormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { CalendarLink, DriveLink, EmailLink } from "@/components/SmartLinks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProjectDriveFiles, type DriveListResult } from "@/lib/googleDrive";
import { buildAddressQuery } from "@/lib/mapbox";
import type { PrefillData } from "@/lib/utilityPrefill";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Project/FormXml/main_form.json";
import {
  addProjectMilestone,
  toggleProjectMilestone,
  deleteProjectMilestone,
  bulkDeleteProjectMilestones,
  createMilestoneNotification,
  deleteMilestoneNotification,
  setProjectGps,
  setProjectAddressFromPoint,
} from "./actions";
import { updateProject } from "../actions";
import { MilestonesPanel, type MilestoneNotification } from "./MilestonesPanel";
import { DriveFilesPanel } from "./DriveFilesPanel";
import { TeamPanel } from "./TeamPanel";
import { LocationMapToggle } from "./LocationMapToggle";
import { PrefillFormButton } from "./PrefillFormButton";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & {
      name: string;
      account_id: string;
      primary_contact_id: string | null;
      drive_url: string | null;
      status: string;
      gps_lat: number | null;
      gps_lng: number | null;
      address_street: string | null;
      address_house_number: string | null;
      address_city: string | null;
      address_zip: string | null;
      address_country: string | null;
      katastralni_uzemi: string | null;
      parcelni_cislo: string | null;
    }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    common,
    accounts,
    contacts,
    templates,
    milestones,
    activityTypes,
    activities,
    teamContacts,
    userOptions,
    navigatorRecords,
    notificationConfigs,
    driveFiles,
    quotes,
    applicantAccount,
    primaryContact,
  ] = await Promise.all([
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
      // Historie a aktivity na Projektu zahrnuje i aktivity jeho Obchodního vztahu a hlavního
      // kontaktu (rollup, stejný D365 vzor jako Account -> Contacts/Projects) — typicky sem
      // spadá e-mailová korespondence zalogovaná přes email tracking, co jinak nikde na
      // Projektu není vidět, i když se týká přesně jeho.
      getTimelineActivities(supabase, { entityType: "Project", entityId: id }, [
        { entityType: "Account", entityId: record.account_id },
        ...(record.primary_contact_id ? [{ entityType: "Contact", entityId: record.primary_contact_id }] : []),
      ]),
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
      supabase
        .from("notifications_config")
        .select(
          "id, milestone_id, type, dni_predem, recipient:users!notifications_config_recipient_user_id_fkey(first_name, last_name, email), project_milestones!inner(project_id)",
        )
        .eq("project_milestones.project_id", id)
        .then((r) => r.data ?? []),
      user ? getProjectDriveFiles(user.id, record.drive_url) : Promise.resolve<DriveListResult>({ status: "no-connection" }),
      listRecords<{ id: string; number: string; name: string; status: string; total: number }>(supabase, "quotes", {
        select: "id, number, name, status, total",
        filter: { project_id: id },
        sort: { field: "created_at", direction: "desc" },
      }),
      supabase
        .from("accounts")
        .select(
          "name, email, ico, address_street, address_house_number, address_city, address_zip, address_country, pravni_forma:option_set_values!accounts_pravni_forma_id_fkey(label)",
        )
        .eq("id", record.account_id)
        .maybeSingle()
        .then((r) => r.data),
      record.primary_contact_id
        ? supabase
            .from("contacts")
            .select("first_name, last_name, phone, mobile_phone, email")
            .eq("id", record.primary_contact_id)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);

  const notificationsByMilestone = (
    notificationConfigs as unknown as Array<{
      id: string;
      milestone_id: string;
      type: "EMAIL" | "PUSH";
      dni_predem: number;
      recipient: { first_name: string | null; last_name: string | null; email: string | null } | null;
    }>
  ).reduce<Record<string, MilestoneNotification[]>>((acc, n) => {
    (acc[n.milestone_id] ??= []).push({
      id: n.id,
      type: n.type,
      dni_predem: n.dni_predem,
      recipientLabel: formatUserName(n.recipient),
    });
    return acc;
  }, {});

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateProject(id, values);
  }

  const account = applicantAccount as unknown as {
    name: string;
    email: string | null;
    ico: string | null;
    address_street: string | null;
    address_house_number: string | null;
    address_city: string | null;
    address_zip: string | null;
    address_country: string | null;
    pravni_forma: { label: string } | null;
  } | null;
  const contact = primaryContact as unknown as {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    mobile_phone: string | null;
    email: string | null;
  } | null;

  const prefillData: PrefillData = {
    applicantName: account?.name ?? record.name,
    applicantIco: account?.ico ?? null,
    applicantLegalForm: account?.pravni_forma?.label ?? null,
    applicantAddress: account ? buildAddressQuery(account) : null,
    contactName: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : null,
    contactPhone: contact?.phone ?? contact?.mobile_phone ?? null,
    contactEmail: contact?.email ?? null,
    locationAddress: buildAddressQuery(record),
    gps: record.gps_lat != null && record.gps_lng != null ? { lat: record.gps_lat, lng: record.gps_lng } : null,
    katastralniUzemi: record.katastralni_uzemi,
    parcelniCislo: record.parcelni_cislo,
  };

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
            <EmailLink email={contact?.email ?? account?.email ?? null} label="Nový e-mail" />
            <CalendarLink title={record.name} />
            <DriveLink url={record.drive_url} />
            <PrefillFormButton data={prefillData} />
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

            <LocationMapToggle
              projectId={id}
              initialLat={record.gps_lat}
              initialLng={record.gps_lng}
              currentAddress={{
                street: record.address_street,
                houseNumber: record.address_house_number,
                city: record.address_city,
                zip: record.address_zip,
                country: record.address_country,
              }}
              onSetGps={setProjectGps}
              onSetAddress={setProjectAddressFromPoint}
            />

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Úkoly / Milníky</h2>
              <MilestonesPanel
                projectId={id}
                milestones={milestones}
                userOptions={userOptions}
                notificationsByMilestone={notificationsByMilestone}
                onAdd={addProjectMilestone}
                onToggle={toggleProjectMilestone}
                onDelete={deleteProjectMilestone}
                onBulkDelete={bulkDeleteProjectMilestones}
                onCreateNotification={createMilestoneNotification}
                onDeleteNotification={deleteMilestoneNotification}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Nabídky</h2>
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link href={`/quotes/new?project_id=${id}&account_id=${record.account_id}`}>
                      <Plus className="size-4" />
                      Nová nabídka
                    </Link>
                  }
                />
              </div>
              {quotes.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  K tomuto projektu zatím nebyla vytvořena žádná nabídka.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {quotes.map((quote) => (
                    <Link
                      key={quote.id}
                      href={`/quotes/${quote.id}`}
                      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    >
                      <Receipt className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{quote.number}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{quote.name}</span>
                      <Badge variant={quote.status === "active" ? "default" : "secondary"}>
                        {quote.status === "active" ? "Aktivní" : "Neaktivní"}
                      </Badge>
                      <span className="shrink-0 text-sm font-medium">
                        {new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" }).format(Number(quote.total) || 0)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Soubory (Google Drive)</h2>
              <DriveFilesPanel
                projectId={id}
                projectName={record.name}
                driveUrl={record.drive_url}
                result={driveFiles}
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
