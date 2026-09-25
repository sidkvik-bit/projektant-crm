import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/PageHeader";
import { CopyBlock } from "@/components/CopyBlock";
import { McpTokenManager } from "./McpTokenManager";
import { listMcpTokens, createMcpToken, revokeMcpToken } from "./actions";

export default async function McpSettingsPage() {
  const [tokens, headerList] = await Promise.all([listMcpTokens(), headers()]);
  const host = headerList.get("host") ?? "tvoje-domena.cz";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const serverUrl = `${protocol}://${host}/api/mcp`;

  return (
    <div>
      <PageHeader
        title="MCP - AI"
        description="Připoj si CRM do svého AI nástroje (Claude, Cursor…) a ptej se na svoje zakázky přímo odtamtud."
      />
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Dvě cesty, podle klienta.</strong> Claude na webu token
            nepotřebuje — přihlásí se sám (viz úplně dole). Pro Claude Desktop a Cursor si vygeneruj token a
            zkopíruj blok, který se objeví; adresa i token jsou v něm už vyplněné.
          </p>
          <p>
            <strong className="text-foreground">Co pak AI umí:</strong> číst zakázky, termíny, zájemce a
            kontakty — a na vyžádání zapisovat: posunout fázi projektu („podepsala se smlouva“), odškrtnout
            milník, opravit telefon u kontaktu, založit zájemce nebo zapsat aktivitu.
          </p>
          <p>
            <strong className="text-foreground">Za AI platíš ty, ne my</strong> — model běží ve tvém klientu,
            na tvém předplatném. Appka jen poskytuje data.
          </p>
          <p>
            Token jedná <strong className="text-foreground">tvým jménem</strong>: AI uvidí a změní přesně to,
            co bys mohl/a ty ve webu, a nic navíc — data jiných firem jsou mimo dosah, i kdyby si o ně řekl.
            <strong className="text-foreground"> Mazat záznamy přes AI nejde vůbec</strong> a každá změna je
            i se starou hodnotou v logu změn.
          </p>
        </div>

        {/* Adresu potřebuje každý klient bez ohledu na způsob přihlášení, takže stojí natrvalo tady —
            ne jen v dialogu po vygenerování tokenu, kam by se uživatel připojující se přes OAuth
            vůbec nedostal. */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Adresa serveru</h2>
          <CopyBlock text={serverUrl} />
          <p className="text-xs text-muted-foreground">
            Tohle vlož do svého AI klienta. Pro claude.ai to je jediné, co potřebuješ.
          </p>
        </div>

        <div className="space-y-3 border-t pt-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Token — jen pro Claude Desktop a Cursor</h2>
            <p className="text-xs text-muted-foreground">
              Pro claude.ai token nepotřebuješ, přeskoč to rovnou dolů.
            </p>
          </div>
          <McpTokenManager
            tokens={tokens}
            serverUrl={serverUrl}
            onCreate={createMcpToken}
            onRevoke={revokeMcpToken}
          />
        </div>

        <div className="space-y-3 border-t pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Kam ten blok vložit</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Cursor:</strong> Settings → MCP → Add new global MCP server —
              otevře se soubor <code className="rounded bg-muted px-1 py-0.5">mcp.json</code>, blok vlož do něj.
            </p>
            <p>
              <strong className="text-foreground">Claude Desktop:</strong> Nastavení → Developer → Edit config.
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t pt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Claude na webu (claude.ai) — bez tokenu</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Tady token vůbec negeneruj. claude.ai se umí přihlásit samo, takže stačí v Nastavení →
              Connectors → Add custom connector vložit <strong className="text-foreground">adresu serveru</strong>{" "}
              a nechat předvybrané <strong className="text-foreground">„Sign in now“</strong>.
            </p>
            <p>
              Po kliknutí na Connect tě to přehodí sem do CRM, přihlásíš se Googlem jako obvykle a odklikneš
              „Povolit“. Žádné tajemství se nikam nekopíruje a přístup se dá kdykoliv zrušit tady v seznamu.
            </p>
            <p>
              Stejně to funguje i pro kolegy — každý se přihlásí svým účtem a uvidí přesně to, co má vidět ve
              webu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
