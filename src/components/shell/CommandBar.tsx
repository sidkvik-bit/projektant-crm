"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/** Plochá lišta akcí nad seznamem/formulářem — PowerApps model-driven command bar. */
export function CommandBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 overflow-x-auto border-b bg-background px-2 py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CommandBarButton({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  variant = "ghost",
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  title?: string;
}) {
  const content = (
    <>
      <Icon className="size-4" />
      {label}
    </>
  );
  const className = "gap-1.5 text-foreground/80 hover:text-foreground";

  if (href && !disabled) {
    return (
      <Button variant={variant} size="sm" className={className} title={title} render={<Link href={href} />}>
        {content}
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" className={className} disabled={disabled} onClick={onClick} title={title}>
      {content}
    </Button>
  );
}

export function CommandBarSeparator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
