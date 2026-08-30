import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createResendClient, DIGEST_FROM_ADDRESS } from "@/lib/resend";

interface MilestoneRow {
  id: string;
  name: string;
  termin_splneni: string;
  splneno: boolean;
  projects: { name: string } | null;
}

interface NotificationConfigRow {
  id: string;
  type: "EMAIL" | "PUSH";
  dni_predem: number;
  recipient_user_id: string;
  project_milestones: MilestoneRow;
  users: { email: string | null; first_name: string | null } | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function renderDigestHtml({
  firstName,
  dueToday,
  overdue,
}: {
  firstName: string | null;
  dueToday: MilestoneRow[];
  overdue: MilestoneRow[];
}) {
  const renderList = (items: MilestoneRow[]) =>
    items
      .map(
        (m) =>
          `<li>${m.name}${m.projects?.name ? ` — ${m.projects.name}` : ""} (${m.termin_splneni})</li>`,
      )
      .join("");

  return `
    <div>
      <p>Ahoj${firstName ? ` ${firstName}` : ""},</p>
      ${overdue.length > 0 ? `<p><strong>Po termínu:</strong></p><ul>${renderList(overdue)}</ul>` : ""}
      ${dueToday.length > 0 ? `<p><strong>Na dnešek:</strong></p><ul>${renderList(dueToday)}</ul>` : ""}
      <p>— Projektant CRM</p>
    </div>
  `;
}

// Vercel Cron volá tenhle endpoint denně v 8:00 s hlavičkou Authorization: Bearer $CRON_SECRET.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayISO();

  const { data, error } = await admin
    .from("notifications_config")
    .select(
      "id, type, dni_predem, recipient_user_id, project_milestones!inner(id, name, termin_splneni, splneno, projects(name)), users(email, first_name)",
    )
    .eq("status", "active")
    .eq("type", "EMAIL")
    .eq("project_milestones.splneno", false)
    .lte("project_milestones.termin_splneni", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as NotificationConfigRow[];

  const byRecipient = new Map<
    string,
    { email: string; firstName: string | null; milestones: MilestoneRow[] }
  >();

  for (const row of rows) {
    const email = row.users?.email;
    if (!email) continue;
    const bucket = byRecipient.get(row.recipient_user_id) ?? {
      email,
      firstName: row.users?.first_name ?? null,
      milestones: [],
    };
    bucket.milestones.push(row.project_milestones);
    byRecipient.set(row.recipient_user_id, bucket);
  }

  const resend = createResendClient();
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const [, recipient] of byRecipient) {
    const overdue = recipient.milestones.filter((m) => m.termin_splneni < today);
    const dueToday = recipient.milestones.filter((m) => m.termin_splneni === today);

    const { error: sendError } = await resend.emails.send({
      from: DIGEST_FROM_ADDRESS,
      to: recipient.email,
      subject: "Projektant CRM — denní přehled úkolů",
      html: renderDigestHtml({ firstName: recipient.firstName, dueToday, overdue }),
    });

    if (sendError) {
      failed.push({ email: recipient.email, error: sendError.message });
    } else {
      sent.push(recipient.email);
    }
  }

  return NextResponse.json({ checkedConfigs: rows.length, sent, failed });
}
