import { PageHeader } from "@/components/shell/PageHeader";
import { ImportWizard } from "@/engine/ImportWizard";
import type { EntityDefinition } from "@/engine/types";
import entity from "@/solutions/Projektant_CRM/Entities/Account/Entity.json";
import { importAccounts } from "../actions";

export default async function ImportAccountsPage() {
  return (
    <div>
      <PageHeader title="Import firem z Excelu" />
      <div className="mx-auto max-w-3xl p-6">
        <ImportWizard entity={entity as EntityDefinition} onImport={importAccounts} />
      </div>
    </div>
  );
}
