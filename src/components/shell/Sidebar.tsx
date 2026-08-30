"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNav, settingsNav } from "./nav";

function NavLink({ item }: { item: (typeof mainNav)[number] }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

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
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ organizationName }: { organizationName: string }) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Projektant CRM</p>
          <p className="truncate text-xs leading-tight text-sidebar-foreground/60">
            {organizationName}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/40">
          Nastavení
        </p>
        {settingsNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}
