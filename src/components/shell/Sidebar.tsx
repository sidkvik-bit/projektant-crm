"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navGroups, type NavItem } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { AnimatedLogo } from "./AnimatedLogo";

// Deliberately NOT a route-level `loading.tsx` — that wraps every page (including every
// `[id]/page.tsx` that calls `notFound()`) in a Suspense boundary, which locks the HTTP
// response to 200 before the page can resolve its own 404 (broke tenant-isolation's "direct
// URL to another tenant's record must 404" guarantee). `useLinkStatus` tracks a single
// Link's pending state entirely client-side, with no server Suspense boundary involved.
function NavIcon({ Icon }: { Icon: NavItem["icon"] }) {
  const { pending } = useLinkStatus();
  if (pending) return <AnimatedLogo size={16} active className="shrink-0" />;
  return <Icon className="size-4 shrink-0" />;
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <NavIcon Icon={item.icon} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ organizationName }: { organizationName: string }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 shrink-0 items-center justify-center">
          <AnimatedLogo size={28} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Projektant CRM</p>
          <p className="truncate text-xs leading-tight text-sidebar-foreground/60">
            {organizationName}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group, i) => (
          <div key={group.label} className={i > 0 ? "pt-4" : undefined}>
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/40">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <ThemeToggle />
      </div>
    </aside>
  );
}
