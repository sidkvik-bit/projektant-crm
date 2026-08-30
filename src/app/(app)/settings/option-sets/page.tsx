import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";

export default async function OptionSetsPage() {
  const supabase = await createClient();

  const { data: optionSets } = await supabase
    .from("option_sets")
    .select("id, key, label, option_set_values(count)")
    .order("label", { ascending: true });

  return (
    <div>
      <PageHeader title="Číselníky" description="Vlastní hodnoty pro picklisty napříč aplikací." />
      <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {(optionSets ?? []).map((set) => (
          <Link
            key={set.id}
            href={`/settings/option-sets/${set.id}`}
            className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <p className="font-medium">{set.label}</p>
            <p className="text-xs text-muted-foreground">{set.key}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {(set.option_set_values as unknown as { count: number }[])[0]?.count ?? 0} hodnot
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
