import { lockVatRateUnlessPayer } from "@/lib/organizationBilling";
import { notFound } from "next/navigation";
import { Download, FolderKanban } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getRecordById, listRecords } from "@/engine/Database";
import { getCommonFormContext } from "@/engine/formContext";
import { getOptionSetValues } from "@/engine/optionSets";
import { getTimelineActivities } from "@/engine/activities";
import { createTimelineActivity } from "@/engine/entityActions";
import { CustomizedFormEngine } from "@/customization/CustomizedFormEngine";
import { ActivityTimeline } from "@/engine/ActivityTimeline";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntityDefinition, FormDefinition } from "@/engine/types";
import type { EntityFormValues } from "@/engine/zodSchema";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Quote/FormXml/main_form.json";
import {
  addQuoteItem,
  updateQuoteItem,
  deleteQuoteItem,
  generateInvoiceFromQuote,
  addQuotePhasesFromTemplates,
  addEmptyQuotePhase,
  updateQuotePhase,
  deleteQuotePhase,
  moveQuotePhaseAction,
} from "./actions";
import { QuotePhasesPanel } from "./QuotePhasesPanel";
import { listQuotePhases } from "@/lib/quotePhases";
import { updateQuote } from "../actions";
import { QuoteItemsPanel, type QuoteItem } from "./QuoteItemsPanel";
import { GenerateInvoiceDialog } from "./GenerateInvoiceDialog";

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
      je_platce_dph: boolean;
      status: string;
    }
  >(supabase, entity.table, id).catch(() => null);

  if (!record) notFound();

  const [common, accounts, contacts, projects, activityTypes, activities, items, phases, phaseTemplates, supplierProfiles] = await Promise.all([
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
    listQuotePhases(supabase, id),
    listRecords<{ kod: string; nazev: string }>(supabase, "quote_phase_templates", {
      select: "kod, nazev",
      sort: { field: "sort_order", direction: "asc" },
    }),
    listRecords<{ id: string; nazev: string }>(supabase, "supplier_profiles", { select: "id, nazev" }),
  ]);

  async function handleUpdate(values: EntityFormValues) {
    "use server";
    return updateQuote(id, values);
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
                <a href={`/api/quotes/${id}/pdf`}>
                  <Download className="size-4" />
                  Stáhnout PDF
                </a>
              }
            />
            <GenerateInvoiceDialog
              quoteId={id}
              items={items}
              vatRate={Number(record.vat_rate) || 0}
              onGenerate={generateInvoiceFromQuote}
            />
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
            <CustomizedFormEngine
              entity={lockVatRateUnlessPayer(entity as EntityDefinition, record.je_platce_dph)}
              form={formDef as FormDefinition}
              defaultValues={record}
              optionSetValues={common.optionSetValues}
              lookupOptions={{
                ...common.lookupOptions,
                Project: projects.map((p) => ({ id: p.id, label: p.name })),
                Account: accounts.map((a) => ({ id: a.id, label: a.name })),
                SupplierProfile: supplierProfiles.map((p) => ({ id: p.id, label: p.nazev })),
                Contact: contacts.map((c) => ({
                  id: c.id,
                  label: [c.first_name, c.last_name].filter(Boolean).join(" "),
                })),
              }}
              onSubmit={handleUpdate}
              submitLabel="Uložit změny"
            />

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Rozsah – fáze nabídky</h2>
              <QuotePhasesPanel
                quoteId={id}
                phases={phases}
                templates={phaseTemplates}
                onAddFromTemplates={addQuotePhasesFromTemplates}
                onAddEmpty={addEmptyQuotePhase}
                onUpdate={updateQuotePhase}
                onDelete={deleteQuotePhase}
                onMove={moveQuotePhaseAction}
              />
            </div>

            {/* Položky (množství × cena) má jen starší nabídka; nové se skládají z fází. */}
            {items.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Položky nabídky (starší způsob)</h2>
                <QuoteItemsPanel
                  quoteId={id}
                  items={items}
                  vatRate={Number(record.vat_rate) || 0}
                  onAdd={addQuoteItem}
                  onUpdate={updateQuoteItem}
                  onDelete={deleteQuoteItem}
                />
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Náhled PDF</h2>
              {/* Klíč z obsahu fází: po každé změně se náhled načte znovu. Změny polí formuláře
                  se projeví po uložení (stránka se obnoví). */}
              <iframe
                key={phases.map((p) => `${p.id}:${p.nazev}:${p.cena}:${p.odrazky.length}:${p.sort_order}`).join("|")}
                src={`/api/quotes/${id}/pdf?inline=1`}
                title="Náhled PDF nabídky"
                className="h-[1100px] w-full rounded-lg border"
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
