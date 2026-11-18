export interface TemplateMilestoneInput {
  name: string;
  offset_dni: number;
  description?: string | null;
}

export interface GeneratedMilestone {
  name: string;
  description: string | null;
  termin_splneni: string;
  splneno: false;
}

/**
 * Pure due-date math behind "generate milestones from a template" (Project and
 * ProjectTemplate both rely on this): each template milestone's offset_dni is added to
 * the project's start date (or today, if the project has none yet) to get a due date.
 * Kept separate from the Supabase read/insert calls in projects/actions.ts so this — the
 * actual business rule — is unit-testable without a live database.
 */
export function computeMilestoneDueDates(
  templateMilestones: TemplateMilestoneInput[],
  startDate: string | null,
  today: Date = new Date(),
): GeneratedMilestone[] {
  const base = startDate ? new Date(startDate) : today;
  return templateMilestones.map((tm) => {
    const due = new Date(base);
    due.setDate(due.getDate() + tm.offset_dni);
    return {
      name: tm.name,
      // Popis kroku (co se v něm odevzdává) patří k milníku stejně jako název — dřív se
      // při kopírování ze šablony ztrácel.
      description: tm.description?.trim() || null,
      termin_splneni: due.toISOString().slice(0, 10),
      splneno: false,
    };
  });
}
