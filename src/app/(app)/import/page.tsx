import { PageHeader } from "@/components/shell/PageHeader";
import { ImportWizard } from "@/engine/ImportWizard";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;

  return (
    <div>
      <PageHeader
        title="Import z Excelu"
        description="Funguje pro libovolnou tabulku — vyber entitu, nahraj soubor, namapuj sloupce."
      />
      <div className="mx-auto max-w-3xl p-6">
        <ImportWizard defaultEntityName={entity} />
      </div>
    </div>
  );
}
