import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  KanbanSquare,
  Target,
  Building2,
  Users,
  FolderKanban,
  ClipboardList,
  Activity,
  UsersRound,
  ListTree,
  FileSpreadsheet,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Levý panel je rozdělený stejně jako v PowerApps model-driven appce:
 * dashboardy, business tabulky, číselníky (včetně šablon — jsou to taky
 * jen předpřipravená data, ne transakční záznamy) a nastavení. */
export const navGroups: NavGroup[] = [
  {
    label: "Dashboardy",
    items: [
      { label: "Můj den", href: "/dashboard", icon: LayoutDashboard },
      { label: "Kanban", href: "/kanban", icon: KanbanSquare },
    ],
  },
  {
    label: "Tabulky",
    items: [
      { label: "Zájemci", href: "/leads", icon: Target },
      { label: "Obchodní vztahy", href: "/accounts", icon: Building2 },
      { label: "Kontakty", href: "/contacts", icon: Users },
      { label: "Projekty", href: "/projects", icon: FolderKanban },
      { label: "Aktivity", href: "/activities", icon: Activity },
    ],
  },
  {
    label: "Číselníky",
    items: [
      { label: "Šablony projektů", href: "/project-templates", icon: ClipboardList },
      { label: "Hodnoty číselníků", href: "/settings/option-sets", icon: ListTree },
    ],
  },
  {
    label: "Nastavení",
    items: [
      { label: "Tým", href: "/settings/team", icon: UsersRound },
      { label: "Import z Excelu", href: "/import", icon: FileSpreadsheet },
    ],
  },
];
