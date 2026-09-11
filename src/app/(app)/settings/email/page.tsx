import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/PageHeader";
import { CopyBlock } from "./CopyBlock";
import { EmailSyncStatusCard } from "./EmailSyncStatusCard";
import { getEmailSyncStatus } from "./actions";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pb-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function EmailSettingsPage() {
  const [status, headerList] = await Promise.all([getEmailSyncStatus(), headers()]);
  const origin = `https://${headerList.get("host") ?? "tvoje-domena.cz"}`;
  const redirectUri = `${origin}/api/google/gmail/callback`;
  const cronUrl = `${origin}/api/cron/email-sync`;

  const cronSql = `-- Jednou spustit v Supabase Dashboardu -> SQL Editor (obsahuje CRON_SECRET z .env, nepatří do gitu)
select vault.create_secret('<CRON_SECRET z .env.local>', 'cron_secret');

select cron.schedule(
  'email-sync',
  '*/15 * * * *', -- každých 15 minut
  $$
  select net.http_post(
    url := '${cronUrl}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);`;

  return (
    <div>
      <PageHeader
        title="Sledování e-mailů"
        description="Automaticky loguje e-mailovou korespondenci k Obchodním vztahům, Kontaktům a Zájemcům podle e-mailové adresy."
      />
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <EmailSyncStatusCard status={status} />

        <div className="space-y-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Jak to funguje:</strong> Google Workspace umí na úrovni domény
            automaticky poslat skrytou kopii (BCC) každého odchozího (a volitelně příchozího) e-mailu na jednu
            dedikovanou adresu — nikdo si nemusí pamatovat cokoliv kopírovat ručně. Appka tuhle schránku pravidelně
            čte, a pokud odesílatel/příjemce e-mailu odpovídá e-mailu u Obchodního vztahu, Kontaktu nebo Zájemce v
            CRM, založí se k němu Aktivita typu E-mail. E-maily bez shody se nikam nelogují.
          </p>
        </div>

        <div className="space-y-6">
          <Step n={1} title="Založ dedikovanou schránku">
            <p>
              Ve Workspace Admin Console (Adresáře → Uživatelé, nebo jako alias existující schránky) založ e-mailovou
              adresu jen pro tenhle účel, např. <code className="rounded bg-muted px-1 py-0.5">crm@tvoje-domena.cz</code>.
              Nikdo do ní nemusí chodit ručně — appka ji čte přes API.
            </p>
          </Step>

          <Step n={2} title="Nastav automatické BCC pravidlo">
            <p>
              V Admin Console: <strong>Apps → Google Workspace → Gmail → Compliance</strong>, sekce{" "}
              <strong>Content compliance</strong> → Add rule (Configure).
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Email messages to affect: zaškrtni <strong>Outbound</strong> (a klidně i Inbound, ať se loguj i odpovědi klientů)</li>
              <li>Expression: Simple content match, hodnota <code className="rounded bg-muted px-1 py-0.5">.*</code> (shoduje vše)</li>
              <li>Action: Modify message → Add more recipients → Basic → zadej adresu z kroku 1</li>
            </ul>
            <p className="text-xs">
              Pozn.: dostupnost Content compliance pravidel se může lišit podle Workspace tarifu — pokud sekci
              nevidíš, ověř to přímo v Admin Console nebo u Google podpory.
            </p>
          </Step>

          <Step n={3} title="Povol Gmail API a přidej redirect URI">
            <p>
              V Google Cloud Console (stejný projekt, co používá appka pro přihlášení/Google Drive) povol{" "}
              <strong>Gmail API</strong> (API & Services → Library) a v OAuth klientovi (API & Services → Credentials)
              přidej do &quot;Authorized redirect URIs&quot;:
            </p>
            <CopyBlock text={redirectUri} />
          </Step>

          <Step n={4} title="Připoj schránku">
            <p>
              Přihlas se přes tlačítko výš <strong>jako ta dedikovaná schránka</strong> (ne jako svůj běžný účet) a
              odsouhlas přístup ke čtení pošty.
            </p>
          </Step>

          <Step n={5} title="Zapni pravidelnou synchronizaci">
            <p>
              Jednorázově spusť v Supabase Dashboardu → SQL Editor (doplň svůj <code className="rounded bg-muted px-1 py-0.5">CRON_SECRET</code>{" "}
              z <code className="rounded bg-muted px-1 py-0.5">.env.local</code> / Vercel proměnných):
            </p>
            <CopyBlock text={cronSql} label="SQL Editor" />
            <p className="text-xs">
              Bez tohohle kroku se schránka připojí, ale nic se automaticky nesynchronizuje.
            </p>
          </Step>
        </div>
      </div>
    </div>
  );
}
