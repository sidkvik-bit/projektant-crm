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
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { label: "Můj den", href: "/dashboard", icon: LayoutDashboard },
  { label: "Kanban", href: "/kanban", icon: KanbanSquare },
  { label: "Zájemci", href: "/leads", icon: Target },
  { label: "Firmy", href: "/accounts", icon: Building2 },
  { label: "Kontakty", href: "/contacts", icon: Users },
  { label: "Projekty", href: "/projects", icon: FolderKanban },
  { label: "Šablony projektů", href: "/project-templates", icon: ClipboardList },
  { label: "Aktivity", href: "/activities", icon: Activity },
];

export const settingsNav: NavItem[] = [
  { label: "Tým", href: "/settings/team", icon: UsersRound },
  { label: "Číselníky", href: "/settings/option-sets", icon: ListTree },
];
