import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserContext } from "@/lib/currentUser";

const ADMIN_TABS = [
  { href: "/admin/organizations", label: "Organizace" },
  { href: "/admin/users", label: "Uživatelé a role" },
  { href: "/admin/audit-log", label: "Log změn" },
];

/** Jediné místo, kde se hlídá přístup do CELÉ /admin sekce — každá podstránka se tak nemusí
 * gatovat zvlášť (a nejde na ni omylem zapomenout). Platform Superadmin je role NAD všemi
 * organizacemi, ne role v rámci jedné firmy. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!context.isSuperadmin) redirect("/dashboard");

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b bg-background px-4 py-2 sm:px-6">
        {ADMIN_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
