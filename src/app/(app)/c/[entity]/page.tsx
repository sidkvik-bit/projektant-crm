import { EntityListPage } from "@/engine/EntityListPage";
import { formatUserName } from "@/engine/users";
import { defaultCustomViews } from "@/customization/merge";
import { customEntityBasePath } from "@/customization/registry";
import { loadCustomEntityPage } from "@/customization/customEntityPage";

export default async function CustomEntityListPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entity: name } = await params;
  const { entity, definition } = await loadCustomEntityPage(name);

  return (
    <EntityListPage
      entity={entity}
      views={defaultCustomViews(entity)}
      select="id, name, status, created_at, custom, status_reason:option_set_values!custom_records_status_reason_id_fkey(label), owner:users!custom_records_owner_id_fkey(first_name, last_name, email)"
      basePath={customEntityBasePath(name)}
      newLabel="Nový záznam"
      description={definition.description}
      searchParams={searchParams}
      mapRow={(row) => ({
        ...row,
        status_reason: (row.status_reason as unknown as { label: string } | null)?.label ?? null,
        owner: formatUserName(row.owner as never),
      })}
    />
  );
}
