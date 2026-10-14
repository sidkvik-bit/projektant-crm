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
  Bug,
  HardDrive,
  Receipt,
  Banknote,
  Landmark,
  Mail,
  Building,
  Gauge,
  ShieldCheck,
  ScrollText,
  UserCog,
  UserRound,
  Plug,
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
      { label: "Přehled projektů", href: "/project-overview", icon: Gauge },
      { label: "Kanban", href: "/kanban", icon: KanbanSquare },
    ],
  },
  {
    label: "Tabulky",
    items: [
      { label: "Zájemci", href: "/leads", icon: Target },
      { label: "Firmy", href: "/accounts", icon: Building2 },
      { label: "Kontakty", href: "/contacts", icon: Users },
      { label: "Projekty", href: "/projects", icon: FolderKanban },
      { label: "Nabídky", href: "/quotes", icon: Receipt },
      { label: "Faktury", href: "/invoices", icon: Banknote },
      { label: "Aktivity", href: "/activities", icon: Activity },
      { label: "Bugy", href: "/bugs", icon: Bug },
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
      { label: "Můj profil", href: "/settings/profile", icon: UserRound },
      { label: "Tým", href: "/settings/team", icon: UsersRound },
      { label: "Přepnout firmu", href: "/settings/organization", icon: Building },
      { label: "Google Drive", href: "/settings/google-drive", icon: HardDrive },
      { label: "Sledování e-mailů", href: "/settings/email", icon: Mail },
      { label: "MCP - AI", href: "/settings/mcp", icon: Plug },
      { label: "Fakturace", href: "/settings/invoicing", icon: Landmark },
      { label: "Import z Excelu", href: "/import", icon: FileSpreadsheet },
    ],
  },
];

/** Zvlášť od navGroups — vykresluje se jen uživateli s rolí Platform Superadmin (viz
 * SidebarContent). Skrytí odkazu ale není ochrana; tu vynucuje src/app/(app)/admin/layout.tsx. */
export const adminNavGroup: NavGroup = {
  label: "Admin",
  items: [
    { label: "Organizace", href: "/admin/organizations", icon: ShieldCheck },
    { label: "Uživatelé a role", href: "/admin/users", icon: UserCog },
    { label: "Log změn", href: "/admin/audit-log", icon: ScrollText },
  ],
};
