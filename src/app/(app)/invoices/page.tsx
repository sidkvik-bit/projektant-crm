import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { formatContactName } from "@/engine/contacts";
import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Invoice/Entity.json";
import viewTemplate from "@/solutions/Projektant_CRM/Entities/Invoice/SavedQueries/active_invoices.json";
import myView from "@/solutions/Projektant_CRM/Entities/Invoice/SavedQueries/my_invoices.json";

const currencyFormat = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[...buildStatusViews(entity as EntityDefinition, viewTemplate as ViewTemplate), myView as ViewDefinition]}
      select="id, number, name, status, datum_splatnosti, total, created_at, project:projects!invoices_project_id_fkey(name), contact:contacts!invoices_contact_id_fkey(first_name, last_name), status_reason:option_set_values!invoices_status_reason_id_fkey(label), owner:users!invoices_owner_id_fkey(first_name, last_name, email)"
      basePath="/invoices"
      newLabel="Nová faktura"
      description="Faktury generované z nabídek — položky, splatnost a QR Platba se řeší na detailu faktury."
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        project: (row.project as unknown as { name: string } | null)?.name ?? null,
        contact: formatContactName(row.contact as never),
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
        total: currencyFormat.format(Number(row.total) || 0),
      })}
    />
  );
}
