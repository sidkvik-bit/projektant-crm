import Link from "next/link";

/** Veřejné právní stránky (Google OAuth consent screen na ně přímo odkazuje) — schválně mimo
 * (app) shell (žádný sidebar/topbar, žádné přihlášení potřeba) a mimo proxy.ts autorizaci,
 * viz PUBLIC_PATHS. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <Link href="/" className="text-sm font-semibold">
          ProjektantCRM
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="space-y-6 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-medium [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_strong]:text-foreground">
          {children}
        </article>
      </main>
      <footer className="border-t px-6 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1">
          <Link href="/Privacy" className="hover:text-foreground hover:underline">
            Zásady ochrany osobních údajů
          </Link>
          <Link href="/Toc" className="hover:text-foreground hover:underline">
            Podmínky užití
          </Link>
        </div>
      </footer>
    </div>
  );
}
