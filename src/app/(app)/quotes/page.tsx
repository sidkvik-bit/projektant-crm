import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Quote/Entity.json";
import activeView from "@/solutions/Projektant_CRM/Entities/Quote/SavedQueries/active_quotes.json";
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
      views={[activeView, myView] as ViewDefinition[]}
      select="id, number, name, status, valid_until, total, created_at, project:projects!quotes_project_id_fkey(name), account:accounts!quotes_account_id_fkey(name), status_reason:option_set_values!quotes_status_reason_id_fkey(label), owner:users!quotes_owner_id_fkey(first_name, last_name, email)"
      basePath="/quotes"
      newLabel="Nová nabídka"
      description="Cenové nabídky k projektům — položky, DPH a generování PDF řešíte na detailu nabídky."
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        project: (row.project as unknown as { name: string } | null)?.name ?? null,
        account: (row.account as unknown as { name: string } | null)?.name ?? null,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
        total: currencyFormat.format(Number(row.total) || 0),
      })}
    />
  );
}
