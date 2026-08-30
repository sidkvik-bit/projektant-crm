import { EntityListPage } from "@/engine/EntityListPage";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Contact/Entity.json";
import view from "@/solutions/Projektant_CRM/Entities/Contact/SavedQueries/active_contacts.json";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      view={view as ViewDefinition}
      select="id, first_name, last_name, email, status, created_at, account:accounts(name), profese:option_set_values!contacts_profese_id_fkey(label), status_reason:option_set_values!contacts_status_reason_id_fkey(label)"
      basePath="/contacts"
      newLabel="Nový kontakt"
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        account: (row.account as unknown as { name: string } | null)?.name ?? null,
        profese: (row.profese as unknown as { label: string } | null)?.label ?? null,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
      })}
    />
  );
}
