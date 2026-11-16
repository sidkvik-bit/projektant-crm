import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/currentUser";

const TABS = [
  { href: "/settings/customization", label: "Přehled" },
  { href: "/settings/customization/publish", label: "Publikovat" },
  { href: "/settings/customization/history", label: "Historie" },
  { href: "/settings/customization/log", label: "Log skriptů" },
];

/** Studio úprav firmy — jen pro System Customizer / Platform Superadmin. Zápis navíc hlídá RLS. */
export default async function CustomizationLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  if (!user.isCustomizer) notFound();

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b bg-background px-4 py-2 sm:px-6" aria-label="Přizpůsobení">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
        <a
          href="https://github.com/sidkvik-bit/projektant-crm/tree/develop/docs/upravy-firmy"
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          Dokumentace ↗
        </a>
      </nav>
      {children}
    </div>
  );
}
