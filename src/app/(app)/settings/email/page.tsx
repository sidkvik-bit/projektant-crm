import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/PageHeader";
import { CopyBlock } from "@/components/CopyBlock";
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
  const host = headerList.get("host") ?? "tvoje-domena.cz";
  // Vercel/proxy nastaví x-forwarded-proto na "https" spolehlivě; lokální `next dev` ho
  // nenastavuje vůbec (obyčejné http) — bez tyhle podmínky by návod ukazoval "https://localhost"
  // a Google by pak odmítl redirect_uri, co appka reálně posílá (http://localhost:3000).
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/google/gmail/callback`;
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  // Supabase běží v cloudu a na tvůj lokální počítač se nedostane — tenhle SQL skript musí
  // vždycky mířit na skutečně nasazenou appku, i když si tuhle stránku prohlížíš z localhostu.
  const cronUrl = isLocalhost ? "<https://tvoje-nasazena-domena.cz>/api/cron/email-sync" : `${origin}/api/cron/email-sync`;

  const cronSql = `-- Jednou spustit v Supabase Dashboardu -> SQL Editor (obsahuje CRON_SECRET z .env, nepatří do gitu)
select vault.create_secret('<CRON_SECRET z .env.local>', 'cron_secret');

select cron.schedule(
  'email-sync',
  '*/15 * * * *', -- každých 15 minut — stejně "levné" jako hodinu, jen menší zpoždění
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
        description="Automaticky loguje e-mailovou korespondenci k firmám, Kontaktům a Zájemcům podle e-mailové adresy."
      />
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <EmailSyncStatusCard status={status} />

        <div className="space-y-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Jak to funguje:</strong> Google Workspace umí na úrovni domény
            automaticky poslat skrytou kopii (BCC) každého odchozího i příchozího e-mailu na jednu dedikovanou
            adresu — nikdo si nemusí pamatovat cokoliv kopírovat ručně. Appka tuhle schránku pravidelně
            přečte, a pokud odesílatel/příjemce e-mailu odpovídá e-mailu u firmy, Kontaktu nebo Zájemce
            v CRM (podle pole &quot;E-mail&quot; na daném záznamu), založí se k němu Aktivita typu E-mail — předmět,
            Od/Komu/Kopie, případná priorita a text zprávy. E-mail bez shody se nikam neukládá, jen se přečte a
            přeskočí.
          </p>
          <p>
            <strong className="text-foreground">Synchronizace běží každých 15 minut</strong> (viz krok 5) — nový
            e-mail se v CRM objeví max. s 15minutovým zpožděním, ne okamžitě.
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
              <li>
                Email messages to affect: zaškrtni <strong>Outbound i Inbound</strong> — bez Inbound se do CRM
                nedostanou odpovědi klientů, jen to, co posíláš ty
              </li>
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

          <Step n={5} title="Zapni pravidelnou synchronizaci (každých 15 minut)">
            <p>
              Jednorázově spusť v Supabase Dashboardu → SQL Editor (doplň svůj <code className="rounded bg-muted px-1 py-0.5">CRON_SECRET</code>{" "}
              z <code className="rounded bg-muted px-1 py-0.5">.env.local</code> / Vercel proměnných).{" "}
              <code className="rounded bg-muted px-1 py-0.5">pg_cron</code>/<code className="rounded bg-muted px-1 py-0.5">pg_net</code>{" "}
              jsou součástí i free tieru Supabase — tahle úloha nic nestojí.
            </p>
            <CopyBlock text={cronSql} label="SQL Editor" />
            {isLocalhost && (
              <p className="text-xs text-destructive">
                Prohlížíš si tohle z localhostu — Supabase se na tvůj počítač nedostane. Než skript spustíš,
                nahraď <code className="rounded bg-muted px-1 py-0.5">{cronUrl}</code> skutečnou nasazenou adresou appky.
              </p>
            )}
            <p className="text-xs">
              Bez tohohle kroku se schránka připojí, ale nic se automaticky nesynchronizuje.
            </p>
          </Step>
        </div>
      </div>
    </div>
  );
}
