import Link from "next/link";
import {
  Target,
  Building2,
  FolderKanban,
  Receipt,
  Mail,
  MapPin,
  HardDrive,
  BellRing,
  FileSpreadsheet,
  KanbanSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/shell/AnimatedLogo";

/** Veřejná úvodní stránka — schválně NENÍ za přihlášením (Google při ověřování OAuth appky
 * vyžaduje, aby se kdokoliv, včetně jejich schvalovatele, dostal na domovskou stránku a
 * pochopil z ní, co appka dělá). Viz i PUBLIC_PATHS v src/proxy.ts. */
const FEATURES = [
  {
    icon: Target,
    title: "Zájemci a firmy",
    description:
      "Eviduj poptávky od prvního kontaktu, kvalifikuj je jedním kliknutím na firmu s kontaktní osobou, nebo rovnou na projekt.",
  },
  {
    icon: FolderKanban,
    title: "Projekty s milníky a termíny",
    description:
      "Každý projekt má svoje milníky (studie, DSP, realizace…) s termíny. Šablony projektů ti je vygenerují automaticky podle typu zakázky.",
  },
  {
    icon: BellRing,
    title: "Hlídání termínů",
    description:
      "Denní přehled toho, co hoří a co je na dalších 7 dní, plus e-mailové a in-app upozornění na blížící se milníky.",
  },
  {
    icon: Receipt,
    title: "Nabídky a faktury",
    description:
      "Z nabídky uděláš fakturu jedním kliknutím. PDF s tvým logem, QR platbou a správným číslováním podle roku.",
  },
  {
    icon: Mail,
    title: "Automatické sledování e-mailů",
    description:
      "E-mailová korespondence s klientem se sama přiřadí k jeho záznamu v CRM — bez ručního kopírování a bez toho, aby si na to kdokoliv musel vzpomenout.",
  },
  {
    icon: MapPin,
    title: "Místo realizace na mapě",
    description:
      "U projektu adresu i GPS souřadnice, s vyhledáním v mapě a podklady pro žádosti o vyjádření správců sítí.",
  },
  {
    icon: HardDrive,
    title: "Napojení na Google Drive",
    description:
      "Dokumentace projektu zůstává tam, kde ji máš zvyklou — složka projektu na Drive je vidět přímo z detailu projektu.",
  },
  {
    icon: KanbanSquare,
    title: "Kanban podle fází",
    description:
      "Přetáhni zakázku z poptávky přes nabídku a realizaci až po předání. Přehled o celém pipeline na jedné obrazovce.",
  },
  {
    icon: Building2,
    title: "Víc firem, oddělená data",
    description:
      "Každá organizace vidí výhradně svoje data. Kolegy pozveš e-mailem, o nic víc se starat nemusíš.",
  },
  {
    icon: FileSpreadsheet,
    title: "Import z Excelu",
    description:
      "Stávající kontakty a zakázky naimportuješ z Excelu — průvodce si sám namapuje sloupce a zkontroluje řádky před importem.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <AnimatedLogo size={28} />
          <span className="text-base font-semibold tracking-tight">ProjektantCRM</span>
          <div className="ml-auto">
            <Button size="sm" render={<Link href={user ? "/dashboard" : "/login"} />}>
              {user ? "Otevřít aplikaci" : "Přihlásit se"}
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            CRM pro projektanty a projekční kanceláře
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            <strong className="text-foreground">ProjektantCRM</strong> drží pohromadě to, co se u
            projekčních zakázek obvykle rozpadá mezi Excel, e-mail a papír: poptávky, klienty,
            projekty s termíny, nabídky, faktury i komunikaci. Jedno místo, kde je vidět, v jaké
            fázi je která zakázka a co hoří.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button render={<Link href={user ? "/dashboard" : "/login"} />}>
              {user ? "Otevřít aplikaci" : "Přihlásit se přes Google"}
            </Button>
            <Button variant="outline" render={<Link href="#funkce" />}>
              Co všechno umí
            </Button>
          </div>
        </section>

        <section id="funkce" className="border-t bg-muted/20">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Co ProjektantCRM umí</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Postavené podle toho, jak reálně probíhá projekční zakázka — od poptávky po fakturu.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="space-y-2">
                  <feature.icon className="size-5 text-primary" />
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Pro koho to je</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Projektanti na volné noze</h3>
                <p className="text-sm text-muted-foreground">
                  Přehled o všech rozjetých zakázkách a termínech na jednom místě, bez nutnosti
                  udržovat si vlastní tabulky.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Projekční kanceláře</h3>
                <p className="text-sm text-muted-foreground">
                  Sdílená evidence pro celý tým — kdo má co na starost, v jaké je to fázi a co je
                  po termínu.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Menší stavební firmy</h3>
                <p className="text-sm text-muted-foreground">
                  Evidence poptávek, klientů a zakázek včetně nabídek a fakturace s QR platbou.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/20">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-12">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Přihlášení přes Google účet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Žádné další heslo navíc. Při prvním přihlášení si založíš svoji organizaci, nebo se
                připojíš k té, kam tě pozval kolega.
              </p>
            </div>
            <Button render={<Link href={user ? "/dashboard" : "/login"} />}>
              {user ? "Otevřít aplikaci" : "Přihlásit se přes Google"}
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-8 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">ProjektantCRM</span>
          <span>Provozovatel: Jan Kvíčala, IČO 04323980</span>
          <Link href="/Privacy" className="hover:text-foreground hover:underline">
            Zásady ochrany osobních údajů
          </Link>
          <Link href="/Toc" className="hover:text-foreground hover:underline">
            Podmínky užití
          </Link>
          <a href="mailto:jan.kvicala.29@gmail.com" className="hover:text-foreground hover:underline">
            jan.kvicala.29@gmail.com
          </a>
        </div>
      </footer>
    </div>
  );
}
