"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface QualifyLeadRpcResult {
  accountId: string;
  contactId: string;
  projectId: string | null;
}

export interface QualifyLeadState {
  error: string;
}

/** Kvalifikuje Zájemce na Obchodní vztah + Kontakt (a volitelně i Projekt) — celá logika žije
 * v jedné DB funkci (qualify_lead), ať se to nerozpadne na poloviční stav při dílčí chybě.
 *
 * Bez e-mailu i telefonu by vzniklý Kontakt byl nekontaktovatelný — to se blokuje tady, ne v
 * DB funkci, protože je to čistě UX pravidlo o kvalitě dat (na rozdíl od kontroly organization_id
 * v DB funkci, která je skutečná bezpečnostní hranice), a tohle je jediné volající místo. */
export async function qualifyLead(leadId: string, createProject: boolean): Promise<QualifyLeadState | undefined> {
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("email, phone")
    .eq("id", leadId)
    .single();
  if (leadError) throw leadError;
  if (!lead.email && !lead.phone) {
    return {
      error:
        "Zájemce nemá vyplněný e-mail ani telefon — kontakt, který by z něj vznikl, by byl nekontaktovatelný. Doplň aspoň jeden z nich a zkus to znovu.",
    };
  }

  const { data, error } = await supabase.rpc("qualify_lead", {
    p_lead_id: leadId,
    p_create_project: createProject,
  });
  if (error) throw error;

  const result = data as QualifyLeadRpcResult;
  redirect(createProject ? `/projects/${result.projectId}` : `/accounts/${result.accountId}`);
}
