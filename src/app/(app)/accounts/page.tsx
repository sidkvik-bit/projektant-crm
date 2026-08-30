import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import type { EntityDefinition, ViewDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";
import view from "@/solutions/Projektant_CRM/Entities/Account/SavedQueries/active_accounts.json";

export default async function AccountsPage() {
  return (
    <EntityListPage
      entity={entity as EntityDefinition}
      view={view as ViewDefinition}
      select="id, name, ico, phone, status, created_at, status_reason:option_set_values!accounts_status_reason_id_fkey(label), owner:users!accounts_owner_id_fkey(first_name, last_name, email)"
      basePath="/accounts"
      newLabel="Nový obchodní vztah"
      mapRow={(row) => ({
        ...row,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
