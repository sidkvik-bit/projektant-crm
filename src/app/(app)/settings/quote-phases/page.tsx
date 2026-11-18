import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { PhaseTemplatesClient, type PhaseTemplate } from "./PhaseTemplatesClient";

export default async function QuotePhasesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_phase_templates")
    .select("id, kod, nazev, odrazky, cena, sort_order")
    .order("sort_order");
  if (error) throw error;

  return (
    <div>
      <PageHeader
        title="Šablony fází"
        description="Fáze, které se nabízejí v cenových nabídkách (pasport, studie, DSP…): název, odrážky a cena. Do nabídky se kopírují — úprava v nabídce šablonu nemění."
      />
      <div className="max-w-4xl p-6">
        <PhaseTemplatesClient templates={(data ?? []) as PhaseTemplate[]} />
      </div>
    </div>
  );
}
