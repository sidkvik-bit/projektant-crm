import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { formatContactName } from "@/engine/contacts";
import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import viewTemplate from "@/solutions/Projektant_CRM/Entities/Quote/SavedQueries/active_quotes.json";
import myView from "@/solutions/Projektant_CRM/Entities/Quote/SavedQueries/my_quotes.json";

const currencyFormat = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      views={[...buildStatusViews(entity as EntityDefinition, viewTemplate as ViewTemplate), myView as ViewDefinition]}
      select="id, number, name, status, valid_until, total, created_at, project:projects!quotes_project_id_fkey(name), contact:contacts!quotes_contact_id_fkey(first_name, last_name), status_reason:option_set_values!quotes_status_reason_id_fkey(label), owner:users!quotes_owner_id_fkey(first_name, last_name, email)"
      basePath="/quotes"
      newLabel="Nová nabídka"
      description="Cenové nabídky k projektům — položky, DPH a generování PDF řešíte na detailu nabídky."
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
