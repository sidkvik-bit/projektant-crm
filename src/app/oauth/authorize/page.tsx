import { createClient } from "@/lib/supabase/server";
import { isRedirectUriAllowed, resolveOAuthClient } from "@/lib/mcp/oauthClients";
import { approveAuthorization } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Souhlasná obrazovka OAuth. Sem uživatele pošle jeho AI klient; proxy ho cestou přinutí se
 * přihlásit (viz proxy.ts, parametr `next`), takže než se sem dostane, víme, kdo to je.
 *
 * Pravidlo pro chyby: dokud není ověřený `redirect_uri`, nesmí se nikam přesměrovávat a chyba
 * se ukáže tady. Jinak by z autorizace šel udělat otevřený přesměrovávač na cizí web.
 */
export const dynamic = "force-dynamic";

function ErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const clientId = one("client_id");
  const redirectUri = one("redirect_uri");
  const responseType = one("response_type");
  const codeChallenge = one("code_challenge");
  const codeChallengeMethod = one("code_challenge_method");
  const state = one("state");

  if (!clientId || !redirectUri) {
    return <ErrorScreen title="Neúplný požadavek" detail="Chybí client_id nebo redirect_uri." />;
  }

  const client = await resolveOAuthClient(clientId);
  if (!client) {
    return (
      <ErrorScreen
        title="Neznámá aplikace"
        detail="Aplikace, která tě sem poslala, se nepodařilo ověřit. Zkus připojení v AI klientovi založit znovu."
      />
    );
  }

  if (!isRedirectUriAllowed(client, redirectUri)) {
    return (
      <ErrorScreen
        title="Nepovolená návratová adresa"
        detail="Aplikace se pokusila poslat odpověď jinam, než má ve svých registrovaných adresách. Autorizaci jsme zastavili."
      />
    );
  }

  // Od téhle chvíle je redirect_uri ověřená, takže se chyby smí vracet klientovi podle specifikace.
  const redirectWithError = (error: string) => {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    if (state) target.searchParams.set("state", state);
    return target.toString();
  };

  if (responseType !== "code") {
    return <ErrorScreen title="Nepodporovaný typ odpovědi" detail={`Pokračuj zpět: ${redirectWithError("unsupported_response_type")}`} />;
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return (
      <ErrorScreen
        title="Chybí zabezpečení PKCE"
        detail={`Tenhle server vyžaduje code_challenge_method=S256. Pokračuj zpět: ${redirectWithError("invalid_request")}`}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <ErrorScreen title="Nejsi přihlášen/a" detail="Zkus stránku načíst znovu." />;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  const who = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || user.email;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-lg border p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Povolit přístup do CRM?</h1>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{client.clientName ?? clientId}</strong> žádá o přístup k datům
            účtu <strong className="text-foreground">{who}</strong>.
          </p>
        </div>

        <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
          <p>Aplikace bude moct:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>číst tvoje projekty, termíny, zájemce a kontakty</li>
            <li>zakládat zájemce a zapisovat aktivity</li>
            <li>upravovat projekty, milníky, zájemce a kontakty</li>
          </ul>
          <p>
            <strong className="text-foreground">Mazat nemůže nic</strong> a uvidí přesně to, co ty — data jiných
            firem jsou mimo dosah. Přístup můžeš kdykoliv zrušit v Nastavení → MCP - AI.
          </p>
        </div>

        <form action={approveAuthorization} className="flex justify-end gap-2">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          {state && <input type="hidden" name="state" value={state} />}
          <Button type="submit" name="decision" value="deny" variant="outline">
            Zamítnout
          </Button>
          <Button type="submit" name="decision" value="allow">
            Povolit
          </Button>
        </form>
      </div>
    </div>
  );
}
