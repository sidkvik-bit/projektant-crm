import { notFound } from "next/navigation";
import { Download, FolderKanban, Receipt } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { FormEngine } from "@/engine/FormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Quote/FormXml/main_form.json";
import { addQuoteItem, updateQuoteItem, deleteQuoteItem, generateInvoiceFromQuote } from "./actions";
import { updateQuote } from "../actions";
import { QuoteItemsPanel, type QuoteItem } from "./QuoteItemsPanel";

export default async function QuoteDetailPage({
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
    getTimelineActivities(supabase, { entityType: "Quote", entityId: id }),
    listRecords<QuoteItem>(supabase, "quote_items", {
      select: "id, name, quantity, unit, unit_price, line_total",
      filter: { quote_id: id },
      sort: { field: "sort_order", direction: "asc" },
    }),
  ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    await updateQuote(id, values);
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
                <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  Stáhnout PDF
                </a>
              }
            />
            <form action={generateInvoiceFromQuote.bind(null, id)}>
              <Button type="submit" variant="outline" size="sm">
                <Receipt className="size-4" />
                Vygenerovat fakturu
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Položky nabídky</h2>
                <span className="text-sm text-muted-foreground">Číslo nabídky: {record.number}</span>
              </div>
              <QuoteItemsPanel
                quoteId={id}
                items={items}
                vatRate={Number(record.vat_rate) || 0}
                onAdd={addQuoteItem}
                onUpdate={updateQuoteItem}
                onDelete={deleteQuoteItem}
              />
            </div>
          </TabsContent>

          <TabsContent value="activities" className="max-w-3xl pt-4">
            <ActivityTimeline
              entityType="Quote"
              entityId={id}
              detailPath={`/quotes/${id}`}
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
