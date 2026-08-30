import { createClient } from "@/lib/supabase/server";
import { getOptionSetValues } from "@/engine/optionSets";
import { FormEngine } from "@/engine/FormEngine";
import type { EntityDefinition, FormDefinition } from "@/engine/types";

import entity from "@/solutions/Projektant_CRM/Entities/Lead/Entity.json";
import formDef from "@/solutions/Projektant_CRM/Entities/Lead/FormXml/main_form.json";
import { createLead } from "../actions";

export default async function NewLeadPage() {
  const supabase = await createClient();
  const statusReasonValues = await getOptionSetValues(supabase, entity.statusReasonOptionSetKey);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Nový zájemce</h1>
      <FormEngine
        entity={entity as EntityDefinition}
        form={formDef as FormDefinition}
        optionSetValues={{ [entity.statusReasonOptionSetKey]: statusReasonValues }}
        onSubmit={createLead}
        submitLabel="Vytvořit"
      />
    </div>
  );
}
