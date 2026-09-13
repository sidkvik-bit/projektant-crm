"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "./Sidebar";

/** Hamburger + zásuvka s navigací pro mobil/tablet — stálý Sidebar je od `md` schovaný (viz Sidebar.tsx). */
export function MobileNav({
  organizationName,
  isSuperadmin,
}: {
  organizationName: string;
  isSuperadmin?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Otevřít navigaci"
      >
        <Menu className="size-4" />
      </Button>
      <SheetContent side="left" className="w-72 max-w-[85vw] gap-0 p-0 sm:max-w-xs">
        <SheetTitle className="sr-only">Navigace</SheetTitle>
        <SidebarContent
          organizationName={organizationName}
          isSuperadmin={isSuperadmin}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
