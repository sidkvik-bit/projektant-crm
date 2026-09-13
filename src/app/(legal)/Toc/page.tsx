import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Podmínky užití — Projektant CRM",
};

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Podmínky užití služby</h1>
      <p>Účinné od 13. 9. 2026. Poslední aktualizace: 13. 9. 2026.</p>

      <h2>1. Úvodní ustanovení</h2>
      <p>
        Tyto podmínky užití (dále jen „<strong>Podmínky</strong>“) upravují užívání aplikace
        Projektant CRM dostupné na adrese projektant-crm.vercel.app (dále jen „
        <strong>Aplikace</strong>“), kterou provozuje:
      </p>
      <ul>
        <li>Jan Kvíčala, IČO: 04323980</li>
        <li>Místo podnikání: Bělá 103, 511 01 Turnov, Česká republika</li>
        <li>Kontaktní e-mail: jan.kvicala@navertica.com</li>
      </ul>
      <p>
        (dále jen „<strong>Provozovatel</strong>“). Registrací nebo přihlášením do Aplikace uživatel
        vyjadřuje souhlas s těmito Podmínkami a se Zásadami ochrany osobních údajů.
      </p>

      <h2>2. Popis služby</h2>
      <p>
        Aplikace je CRM (Customer Relationship Management) nástroj určený pro evidenci obchodních
        vztahů, kontaktů, zájemců, projektů, nabídek a faktur, včetně souvisejících funkcí
        (kalendář milníků, notifikace, sledování e-mailové komunikace, integrace na Google Drive a
        další). Aplikace je poskytována na principu více organizací (multi-tenant) — každá
        organizace vidí výhradně svá vlastní data.
      </p>

      <h2>3. Registrace, účet a organizace</h2>
      <ul>
        <li>Přístup do Aplikace vyžaduje přihlášení prostřednictvím Google účtu.</li>
        <li>
          Při prvním přihlášení si uživatel založí novou organizaci, nebo se připojí k existující
          organizaci na základě pozvánky adresované jeho e-mailové adrese.
        </li>
        <li>
          Uživatel je povinen uvádět pravdivé údaje a chránit přístup ke svému Google účtu, přes
          který se do Aplikace přihlašuje.
        </li>
        <li>
          Uživatel může svůj účet kdykoliv přepnout do jiné organizace, ke které má platnou
          pozvánku, nebo si založit organizaci novou — podrobnosti viz funkce Aplikace
          „Přepnout firmu“.
        </li>
      </ul>

      <h2>4. Práva a povinnosti uživatele</h2>
      <p>Uživatel se zavazuje užívat Aplikaci pouze k účelu, ke kterému je určena, a zejména:</p>
      <ul>
        <li>nezasahovat do bezpečnosti nebo provozu Aplikace,</li>
        <li>nenahrávat do Aplikace obsah, který porušuje práva třetích osob nebo platné právní předpisy,</li>
        <li>zajistit, že veškeré osobní údaje třetích osob, které do Aplikace zadává (kontakty, klienti apod.), zpracovává v souladu s GDPR a má pro to odpovídající právní základ,</li>
        <li>
          pokud zapíná funkci sledování e-mailů, zajistit, že je to v souladu s vnitřními
          předpisy jeho organizace a s právy zaměstnanců, jejichž korespondence se tím zpracovává.
        </li>
      </ul>

      <h2>5. Vztah organizace a Provozovatele k osobním údajům (zpracovatelská doložka)</h2>
      <p>
        Ve vztahu k osobním údajům třetích osob (klientů, kontaktů, zájemců a osob v e-mailové
        korespondenci), které organizace do Aplikace zadává nebo které Aplikace zpracovává jejím
        jménem, je organizace <strong>správcem osobních údajů</strong> a Provozovatel
        <strong> zpracovatelem</strong> ve smyslu čl. 28 GDPR. Provozovatel se zavazuje:
      </p>
      <ul>
        <li>zpracovávat tyto údaje pouze na základě doložených pokynů organizace, tj. v rozsahu funkcí Aplikace,</li>
        <li>zajistit odpovídající technická a organizační opatření k ochraně údajů (řízení přístupu na úrovni organizace, šifrovaná komunikace),</li>
        <li>zachovávat mlčenlivost o zpracovávaných údajích,</li>
        <li>využívat další zpracovatele (subdodavatele) pouze v rozsahu uvedeném v Zásadách ochrany osobních údajů, čl. 5,</li>
        <li>být organizaci nápomocen při plnění jejích povinností vůči subjektům údajů (žádosti o výmaz, přístup apod.) a při ohlašování případných bezpečnostních incidentů,</li>
        <li>po ukončení poskytování služby údaje na žádost organizace vymazat nebo vrátit, nevyžaduje-li právní předpis jejich další uchování.</li>
      </ul>
      <p>
        Tento článek tvoří zpracovatelskou doložku mezi organizací (správcem) a Provozovatelem
        (zpracovatelem) a nahrazuje potřebu uzavírat samostatnou smlouvu o zpracování osobních
        údajů, nedohodnou-li se strany výslovně jinak.
      </p>

      <h2>6. Duševní vlastnictví</h2>
      <p>
        Veškerá práva k Aplikaci, jejímu zdrojovému kódu, designu a ochranným známkám náleží
        Provozovateli. Užíváním Aplikace nezískává uživatel žádná práva k duševnímu vlastnictví
        Provozovatele nad rámec licence k užívání Aplikace pro vlastní potřebu. Data, která
        uživatel/organizace do Aplikace vloží, zůstávají ve vlastnictví organizace.
      </p>

      <h2>7. Dostupnost služby a odpovědnost</h2>
      <p>
        Provozovatel vyvíjí přiměřené úsilí k zajištění nepřetržité dostupnosti Aplikace, negarantuje
        však bezchybný a nepřerušovaný provoz. Aplikace je poskytována „tak jak je“ (as is).
        Provozovatel neodpovídá za škody vzniklé výpadkem služby, ztrátou dat v důsledku vyšší moci
        nebo nesprávným užíváním Aplikace uživatelem. Odpovědnost Provozovatele za škodu způsobenou
        z nedbalosti je omezena do výše, kterou připouští platné právo.
      </p>

      <h2>8. Ukončení užívání</h2>
      <p>
        Uživatel může užívání Aplikace kdykoliv ukončit smazáním svého účtu nebo přestáním
        Aplikaci používat. Provozovatel si vyhrazuje právo omezit nebo ukončit přístup uživateli,
        který porušuje tyto Podmínky nebo platné právní předpisy. Po ukončení se postupuje podle
        čl. 5 (výmaz nebo vrácení dat).
      </p>

      <h2>9. Změny Podmínek</h2>
      <p>
        Provozovatel může tyto Podmínky v přiměřeném rozsahu měnit, zejména v souvislosti s
        rozvojem funkcí Aplikace. O podstatných změnách budou uživatelé informováni. Pokračováním v
        užívání Aplikace po nabytí účinnosti změn uživatel s novým zněním souhlasí.
      </p>

      <h2>10. Rozhodné právo a řešení sporů</h2>
      <p>
        Tyto Podmínky se řídí právním řádem České republiky. Případné spory budou přednostně řešeny
        smírnou cestou; nedojde-li k dohodě, je k jejich řešení příslušný obecný soud podle sídla
        Provozovatele.
      </p>

      <h2>11. Kontakt</h2>
      <p>
        Dotazy k těmto Podmínkám směřujte na jan.kvicala@navertica.com.
      </p>
    </>
  );
}
