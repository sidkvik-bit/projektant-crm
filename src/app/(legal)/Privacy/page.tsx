import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zásady ochrany osobních údajů — Projektant CRM",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Zásady ochrany osobních údajů</h1>
      <p>Účinné od 13. 9. 2026. Poslední aktualizace: 13. 9. 2026.</p>

      <h2>1. Kdo je správcem osobních údajů</h2>
      <p>
        Provozovatelem aplikace Projektant CRM (dostupné na adrese projektant-crm.vercel.app,
        dále jen „<strong>Aplikace</strong>“) a správcem osobních údajů ve smyslu Nařízení
        Evropského parlamentu a Rady (EU) 2016/679 (<strong>GDPR</strong>) je:
      </p>
      <ul>
        <li>Jan Kvíčala, IČO: 04323980</li>
        <li>Místo podnikání: Bělá 103, 511 01 Turnov, Česká republika</li>
        <li>
          Kontaktní e-mail: jan.kvicala@navertica.com
        </li>
      </ul>
      <p>
        Ve všech záležitostech týkajících se zpracování osobních údajů, uplatnění práv podle
        těchto zásad nebo GDPR se můžete obrátit na uvedený kontaktní e-mail.
      </p>

      <h2>2. Koho se tyto zásady týkají</h2>
      <p>Aplikace zpracovává osobní údaje ve třech odlišných rolích, které je potřeba rozlišovat:</p>
      <ul>
        <li>
          <strong>Uživatelé Aplikace</strong> — lidé, kteří se do Aplikace přihlašují (přes Google
          účet) a používají ji ke správě obchodních vztahů své organizace.
        </li>
        <li>
          <strong>Kontaktní osoby v databázi organizace</strong> — klienti, zájemci, kontaktní
          osoby a jiné třetí strany, jejichž údaje si uživatelé Aplikace sami zadávají do CRM
          (Obchodní vztahy, Kontakty, Zájemci, Projekty apod.). Správcem těchto údajů je vždy
          konkrétní organizace, která je do Aplikace zadala — provozovatel Aplikace je v tomto
          vztahu <strong>zpracovatelem</strong> (viz čl. 8).
        </li>
        <li>
          <strong>Odesílatelé a příjemci e-mailové korespondence</strong> — pokud organizace
          zapne funkci sledování e-mailů (viz čl. 5), zpracovávají se i osobní údaje osob mimo
          Aplikaci, které si s organizací píšou e-mailem.
        </li>
      </ul>

      <h2>3. Jaké osobní údaje zpracováváme</h2>
      <h3>3.1 Údaje uživatelů Aplikace</h3>
      <ul>
        <li>Jméno, příjmení, e-mailová adresa a profilová fotografie získané z Google účtu při přihlášení</li>
        <li>Identifikátor Google účtu a přístupové/obnovovací tokeny nutné pro přihlášení a propojené služby (Google Drive, Gmail — viz níže)</li>
        <li>Nastavení jazyka, časového pásma a vzhledu aplikace</li>
        <li>Technické záznamy o přihlášení a používání Aplikace (bezpečnostní/provozní logy)</li>
      </ul>

      <h3>3.2 Údaje zadané do CRM organizacemi</h3>
      <p>
        Jméno, kontaktní údaje (e-mail, telefon), adresa, IČO/DIČ, poznámky k obchodnímu vztahu a
        další údaje, které uživatel Aplikace o svých klientech/kontaktech dobrovolně zadá.
      </p>

      <h3>3.3 Lokační údaje</h3>
      <p>
        U projektů může Aplikace ukládat adresu a GPS souřadnice místa realizace projektu
        (geokódováno přes službu Mapbox) — jde o údaj o nemovitosti/projektu, nikoli o poloze
        konkrétní osoby.
      </p>

      <h3>3.4 E-mailová korespondence (funkce sledování e-mailů)</h3>
      <p>
        Pokud si organizace tuto volitelnou funkci sama zapne (nastavením BCC pravidla ve svém
        Google Workspace a připojením dedikované schránky), Aplikace čte e-maily z této schránky a
        u těch, jejichž odesílatel nebo příjemce odpovídá e-mailu existujícího kontaktu, uloží:
        předmět, odesílatele, příjemce/kopii, prioritu a text zprávy (u delších zpráv zkrácený).
        E-maily bez shody na existující kontakt se nikam neukládají. Tato funkce se týká i osob,
        které nejsou uživateli Aplikace ani nemají s provozovatelem Aplikace přímý vztah —
        zpracování se opírá o oprávněný zájem organizace vést historii obchodní komunikace (čl. 4).
      </p>

      <h2>4. Účel a právní základ zpracování</h2>
      <ul>
        <li><strong>Plnění smlouvy</strong> (čl. 6 odst. 1 písm. b) GDPR) — poskytnutí přístupu k Aplikaci uživatelům.</li>
        <li>
          <strong>Oprávněný zájem</strong> (čl. 6 odst. 1 písm. f) GDPR) — vedení evidence obchodních
          vztahů, historie komunikace (včetně sledování e-mailů) a zajištění bezpečnosti a provozu
          Aplikace. Oprávněným zájmem je zde legitimní potřeba organizace mít přehled o vlastní
          obchodní korespondenci.
        </li>
        <li>
          <strong>Souhlas</strong> (čl. 6 odst. 1 písm. a) GDPR) — v rozsahu oprávnění (scope), které
          uživatel při přihlášení přes Google výslovně odsouhlasí (např. přístup ke Google Drive
          nebo ke čtení konkrétní e-mailové schránky).
        </li>
        <li><strong>Plnění právní povinnosti</strong> — pokud to vyžaduje platné právo (např. účetní/daňové předpisy).</li>
      </ul>

      <h2>5. Příjemci osobních údajů a zpracovatelé</h2>
      <p>
        K poskytování Aplikace využíváme následující zpracovatele/poskytovatele infrastruktury,
        kteří mají k datům přístup výhradně v rozsahu nutném pro svoji službu:
      </p>
      <ul>
        <li><strong>Supabase</strong> — databáze, autentizace a serverová infrastruktura</li>
        <li><strong>Vercel</strong> — hosting a provoz webové aplikace</li>
        <li><strong>Google</strong> (Google Cloud / Workspace) — přihlašování, Google Drive, Gmail API pro funkci sledování e-mailů</li>
        <li><strong>Mapbox</strong> — geokódování adres projektů</li>
        <li><strong>Resend</strong> — odesílání e-mailových notifikací z Aplikace</li>
      </ul>
      <p>
        Osobní údaje nepředáváme žádným dalším třetím stranám k jejich vlastním marketingovým ani
        obchodním účelům.
      </p>

      <h2>6. Předávání údajů mimo EU/EHP</h2>
      <p>
        Někteří výše uvedení poskytovatelé mohou zpracovávat data i na serverech mimo Evropský
        hospodářský prostor. V takovém případě je předání vždy podloženo standardními smluvními
        doložkami (Standard Contractual Clauses) podle čl. 46 GDPR nebo jiným odpovídajícím
        mechanismem zajišťujícím ochranu údajů na úrovni srovnatelné s GDPR.
      </p>

      <h2>7. Doba uchování údajů</h2>
      <p>
        Osobní údaje uchováváme po dobu trvání smluvního vztahu (aktivní účet/organizace) a dále po
        dobu nutnou k plnění zákonných povinností (typicky do 10 let u účetních dokladů). Po
        ukončení používání Aplikace organizací jsou data na vyžádání vymazána, nejpozději však do
        90 dnů od ukončení, pokud zákon nevyžaduje delší dobu uchování.
      </p>

      <h2>8. Vztah provozovatele a organizací (zpracovatelská doložka)</h2>
      <p>
        Ve vztahu k údajům, které si organizace do Aplikace sama zadává o svých klientech a
        kontaktech (čl. 3.2–3.4), je organizace <strong>správcem</strong> a provozovatel Aplikace
        <strong> zpracovatelem</strong> ve smyslu čl. 28 GDPR. Provozovatel se zavazuje zpracovávat
        tyto údaje výhradně na základě doložených pokynů organizace (tj. v rozsahu funkcí
        Aplikace), zajistit odpovídající technická a organizační opatření k jejich ochraně,
        zachovávat mlčenlivost a využívat další zpracovatele pouze v rozsahu uvedeném v čl. 5.
        Podrobnosti zpracovatelského vztahu upravují Podmínky užití.
      </p>

      <h2>9. Práva subjektů údajů</h2>
      <p>Máte právo:</p>
      <ul>
        <li>na přístup ke svým osobním údajům a informaci o jejich zpracování,</li>
        <li>na opravu nepřesných údajů,</li>
        <li>na výmaz („právo být zapomenut“), pokud to neodporuje jiné právní povinnosti,</li>
        <li>na omezení zpracování,</li>
        <li>na přenositelnost údajů,</li>
        <li>vznést námitku proti zpracování na základě oprávněného zájmu,</li>
        <li>podat stížnost u Úřadu pro ochranu osobních údajů (uoou.cz), pokud se domníváte, že zpracování porušuje GDPR.</li>
      </ul>
      <p>Pro uplatnění kteréhokoliv z těchto práv nás kontaktujte na jan.kvicala@navertica.com.</p>

      <h2>10. Cookies</h2>
      <p>
        Aplikace používá výhradně technické (nezbytně nutné) cookies pro udržení přihlášené
        relace uživatele — bez nich by Aplikace nemohla fungovat. Nepoužíváme žádné analytické,
        marketingové ani sledovací cookies třetích stran, a proto v souladu se zákonem o
        elektronických komunikacích nevyžadujeme souhlas přes cookie lištu.
      </p>

      <h2>11. Zabezpečení</h2>
      <p>
        Přístup k datům je chráněn autentizací a řízením přístupu na úrovni jednotlivých
        organizací (row-level security) — uživatel jedné organizace nemá přístup k datům jiné
        organizace. Komunikace probíhá výhradně šifrovaně (HTTPS/TLS).
      </p>

      <h2>12. Změny těchto zásad</h2>
      <p>
        Tyto zásady můžeme čas od času aktualizovat, zejména při přidání nových funkcí Aplikace.
        O podstatných změnách budeme uživatele informovat. Aktuální verze je vždy dostupná na této
        adrese.
      </p>
    </>
  );
}
