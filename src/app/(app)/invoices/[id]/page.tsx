import { notFound } from "next/navigation";
import { Download, FolderKanban, CheckCircle2, XCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { FormEngine } from "@/engine/FormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Invoice/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Invoice/FormXml/main_form.json";
import { addInvoiceItem, updateInvoiceItem, deleteInvoiceItem, setInvoicePaid } from "./actions";
import { updateInvoice } from "../actions";
import { InvoiceItemsPanel, type InvoiceItem } from "./InvoiceItemsPanel";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const record = await getRecordById<
    EntityFormValues & {
      name: string;
      number: string;
      project_id: string;
      vat_rate: number;
      status: string;
      uhrazeno: boolean;
    }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const [common, accounts, contacts, projects, activityTypes, activities, items] = await Promise.all([
    getCommonFormContext(supabase, entity as EntityDefinition),
    listRecords<{ id: string; name: string }>(supabase, "accounts", { select: "id, name" }),
    listRecords<{ id: string; first_name: string; last_name: string | null }>(supabase, "contacts", {
      select: "id, first_name, last_name",
    }),
    listRecords<{ id: string; name: string }>(supabase, "projects", { select: "id, name" }),
    getOptionSetValues(supabase, "activity_type"),
    getTimelineActivities(supabase, { entityType: "Invoice", entityId: id }),
    listRecords<InvoiceItem>(supabase, "invoice_items", {
      select: "id, name, quantity, unit, unit_price, line_total",
      filter: { invoice_id: id },
      sort: { field: "sort_order", direction: "asc" },
    }),
  ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateInvoice(id, values);
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
            {record.uhrazeno && <Badge>Uhrazeno</Badge>}
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={`/projects/${record.project_id}`}>
                  <FolderKanban className="size-4" />
                  Otevřít projekt
                </a>
              }
            />
            <Button
              size="sm"
              render={
                <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Stáhnout PDF
                </a>
              }
            />
            <form action={setInvoicePaid.bind(null, id, !record.uhrazeno)}>
              <Button type="submit" variant="outline" size="sm">
                {record.uhrazeno ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                {record.uhrazeno ? "Zrušit uhrazení" : "Označit jako uhrazenou"}
              </Button>
            </form>
          </>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Obecné</TabsTrigger>
            <TabsTrigger value="activities">Historie a aktivity</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="max-w-5xl space-y-8 pt-4">
            <FormEngine
              entity={entity as EntityDefinition}
              form={formDef as FormDefinition}
              defaultValues={record}
              optionSetValues={common.optionSetValues}
              lookupOptions={{
                ...common.lookupOptions,
                Project: projects.map((p) => ({ id: p.id, label: p.name })),
                Account: accounts.map((a) => ({ id: a.id, label: a.name })),
                Contact: contacts.map((c) => ({
                  id: c.id,
                  label: [c.first_name, c.last_name].filter(Boolean).join(" "),
                })),
              }}
              onSubmit={handleUpdate}
              submitLabel="Uložit změny"
            />

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Položky faktury</h2>
              <InvoiceItemsPanel
                invoiceId={id}
                items={items}
                vatRate={Number(record.vat_rate) || 0}
                onAdd={addInvoiceItem}
                onUpdate={updateInvoiceItem}
                onDelete={deleteInvoiceItem}
              />
            </div>
          </TabsContent>

          <TabsContent value="activities" className="max-w-3xl pt-4">
            <ActivityTimeline
              entityType="Invoice"
              entityId={id}
              detailPath={`/invoices/${id}`}
              activities={activities}
              activityTypes={activityTypes}
              onAdd={createTimelineActivity}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
