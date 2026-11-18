import Link from "next/link";
import { HELP_ARTICLES, helpHref } from "./articles";

/** Veřejná nápověda — bez přihlášení (viz PUBLIC_PATHS v src/proxy.ts), mimo (app) shell. */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const groups = [...new Set(HELP_ARTICLES.map((a) => a.group))];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            ProjektantCRM
          </Link>
          <span className="text-sm text-muted-foreground">Nápověda</span>
          <Link href="/login" className="ml-auto text-sm font-medium text-primary hover:underline">
            Otevřít aplikaci
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:flex-row">
        <nav aria-label="Nápověda" className="shrink-0 space-y-5 md:w-56">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              <ul className="space-y-0.5">
                {HELP_ARTICLES.filter((a) => a.group === group).map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={helpHref(a.slug)}
                      className="block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    >
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <article className="min-w-0 flex-1 space-y-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_li]:text-muted-foreground [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:text-muted-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-foreground [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-muted-foreground [&_th]:border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </article>
      </div>
    </div>
  );
}
