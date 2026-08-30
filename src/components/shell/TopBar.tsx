"use client";

import { useState, useTransition } from "react";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface NotificationItem {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CurrentUser {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  initials: string;
}

export function TopBar({
  user,
  notifications,
  onSignOut,
  onMarkRead,
}: {
  user: CurrentUser;
  notifications: NotificationItem[];
  onSignOut: () => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState(notifications);
  const [isPending, startTransition] = useTransition();
  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifikace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              Žádné notifikace
            </p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
                onSelect={() => {
                  if (n.is_read) return;
                  setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
                  startTransition(() => onMarkRead(n.id));
                }}
              >
                <span className={n.is_read ? "text-muted-foreground" : "font-medium"}>
                  {n.message}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("cs-CZ")}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={isPending}
            onSelect={() => startTransition(() => onSignOut())}
          >
            <LogOut />
            Odhlásit se
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
