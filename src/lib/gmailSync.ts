import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailAccessToken } from "./gmailOAuth";
import { extractEmailAddresses, matchRecordsByEmail, type MatchableRecord } from "./gmailMatch";
import {
  buildActivityDescription,
  extractBodyText,
  resolvePriorityLabel,
  stripHtml,
  type GmailPart,
} from "./gmailEmailContent";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Entity + DB tabulka + sloupec pro páry, které se maj podle e-mailu matchovat — Activity
 * je polymorfní (entity_type/entity_id), takže tabulky se dotahují jednotlivě, ne jedním joinem. */
const MATCHABLE_ENTITIES: { entityType: string; table: string }[] = [
  { entityType: "Account", table: "accounts" },
  { entityType: "Contact", table: "contacts" },
  { entityType: "Lead", table: "leads" },
];

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

function headerValue(message: GmailMessage, name: string): string | null {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()) as T };
}

export interface EmailSyncResult {
  organizationId: string;
  status: "synced" | "bootstrapped" | "no-connection" | "no-access" | "error";
  scannedMessages: number;
  loggedActivities: number;
  message?: string;
}

/**
 * Synchronizuje jednu organizaci: stáhne z Gmail historie zprávy nové od posledního běhu
 * (incrementální — Gmail `history.list`), spáruje účastníky (From/To/Cc) na Account/Contact/
 * Lead podle e-mailu a nematchnuté zprávy zahodí (žádný log). Bezpečné volat opakovaně —
 * dedupe jde přes gmail_message_id+entity_type+entity_id (viz migrace), takže duplicitní běh
 * nic nezdvojí.
 */
export async function syncOrganizationEmails(organizationId: string): Promise<EmailSyncResult> {
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("email_sync_connections")
    .select("refresh_token, last_history_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!connection) {
    return { organizationId, status: "no-connection", scannedMessages: 0, loggedActivities: 0 };
  }

  const accessToken = await getGmailAccessToken(connection.refresh_token as string);
  if (!accessToken) {
    return { organizationId, status: "no-access", scannedMessages: 0, loggedActivities: 0, message: "Token vypršel nebo byl odvolán — je potřeba schránku znovu připojit." };
  }

  // První běh po připojení: jen si zapamatuje aktuální historyId a nic nezpracovává —
  // ať se hromadně nenaloguje roky staré historie schránky.
  if (!connection.last_history_id) {
    const profile = await gmailFetch<{ historyId: string }>(accessToken, "/profile");
    if (!profile.ok) {
      return { organizationId, status: "error", scannedMessages: 0, loggedActivities: 0, message: `Gmail API vrátilo chybu (${profile.status}).` };
    }
    await admin
      .from("email_sync_connections")
      .update({ last_history_id: profile.data.historyId, last_synced_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    return { organizationId, status: "bootstrapped", scannedMessages: 0, loggedActivities: 0 };
  }

  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = connection.last_history_id as string;
  let historyExpired = false;

  do {
    const params = new URLSearchParams({ startHistoryId: connection.last_history_id as string, historyTypes: "messageAdded" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmailFetch<{
      history?: { id: string; messagesAdded?: { message: { id: string } }[] }[];
      historyId?: string;
      nextPageToken?: string;
    }>(accessToken, `/history?${params.toString()}`);

    if (!page.ok) {
      // 404 = startHistoryId je moc starý (Gmail historii drží jen omezenou dobu) — bezpečně
      // se přebootstrapuje na aktuální stav místo pádu, ztratí se jen zprávy z mezidobí.
      if (page.status === 404) historyExpired = true;
      break;
    }

    for (const entry of page.data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) messageIds.add(added.message.id);
    }
    if (page.data.historyId) latestHistoryId = page.data.historyId;
    pageToken = page.data.nextPageToken;
  } while (pageToken);

  if (historyExpired) {
    const profile = await gmailFetch<{ historyId: string }>(accessToken, "/profile");
    if (profile.ok) latestHistoryId = profile.data.historyId;
  }

  // Kandidáti na spárování — všechny e-maily v rámci organizace najednou (levnější než
  // dotaz na tabulku pro každou jednotlivou zprávu).
  const candidateLists = await Promise.all(
    MATCHABLE_ENTITIES.map(async ({ entityType, table }) => {
      const { data } = await admin.from(table).select("id, email").eq("organization_id", organizationId).not("email", "is", null);
      return ((data ?? []) as { id: string; email: string }[]).map((r) => ({ entityType, id: r.id, email: r.email }) as MatchableRecord);
    }),
  );
  const candidates = candidateLists.flat();

  // "E-mail" hodnota activity_type číselníku (seed_default_option_sets) — admin klient
  // obchází RLS, takže se organizace filtruje explicitně přes option_sets.organization_id.
  const { data: emailActivityType } = await admin
    .from("option_set_values")
    .select("id, option_sets!inner(key, organization_id)")
    .eq("value_key", "email")
    .eq("option_sets.key", "activity_type")
    .eq("option_sets.organization_id", organizationId)
    .maybeSingle();
  const emailActivityTypeId = (emailActivityType as { id: string } | null)?.id ?? null;

  let loggedActivities = 0;
  if (candidates.length > 0) {
    const activityRows: Record<string, unknown>[] = [];

    for (const messageId of messageIds) {
      // format=full (ne jen metadata) — potřeba MIME tělo zprávy pro Popis aktivity, ne jen
      // Gmailem useknutý snippet. Hlavičky přijdou všechny automaticky, není potřeba je vypisovat.
      const message = await gmailFetch<GmailMessage>(accessToken, `/messages/${messageId}?format=full`);
      if (!message.ok) continue;

      const from = headerValue(message.data, "From");
      const to = headerValue(message.data, "To");
      const cc = headerValue(message.data, "Cc");
      const participants = [
        ...extractEmailAddresses(from),
        ...extractEmailAddresses(to),
        ...extractEmailAddresses(cc),
      ];
      const matches = matchRecordsByEmail(participants, candidates);
      if (matches.length === 0) continue;

      const subject = headerValue(message.data, "Subject") || "(bez předmětu)";
      const activityDate = message.data.internalDate
        ? new Date(Number(message.data.internalDate)).toISOString()
        : new Date().toISOString();

      const extracted = extractBodyText(message.data.payload);
      const body = extracted ? (extracted.isHtml ? stripHtml(extracted.text) : extracted.text) : null;
      const priority = resolvePriorityLabel(headerValue(message.data, "Importance"), headerValue(message.data, "X-Priority"));
      const description = buildActivityDescription({ from, to, cc, priority, body, snippet: message.data.snippet ?? null });

      for (const match of matches) {
        activityRows.push({
          organization_id: organizationId,
          entity_type: match.entityType,
          entity_id: match.entityId,
          subject: `E-mail: ${subject}`,
          description: description || null,
          activity_date: activityDate,
          activity_type_id: emailActivityTypeId,
          gmail_message_id: messageId,
        });
      }
    }

    if (activityRows.length > 0) {
      const { error, count } = await admin
        .from("activities")
        .upsert(activityRows, {
          onConflict: "organization_id,gmail_message_id,entity_type,entity_id",
          ignoreDuplicates: true,
          count: "exact",
        });
      if (!error) loggedActivities = count ?? activityRows.length;
    }
  }

  await admin
    .from("email_sync_connections")
    .update({ last_history_id: latestHistoryId, last_synced_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  return { organizationId, status: "synced", scannedMessages: messageIds.size, loggedActivities };
}

/** Zavolá se z cronu — proběhne pro každou organizaci, co má schránku připojenou. */
export async function syncAllOrganizations(): Promise<EmailSyncResult[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("email_sync_connections").select("organization_id");
  const orgIds = ((data ?? []) as { organization_id: string }[]).map((r) => r.organization_id);
  const results: EmailSyncResult[] = [];
  for (const organizationId of orgIds) {
    results.push(await syncOrganizationEmails(organizationId));
  }
  return results;
}
