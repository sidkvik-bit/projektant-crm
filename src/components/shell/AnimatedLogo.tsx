"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Vektorová (SVG) verze brand marku — P s šipkou. Ve výchozím stavu statická; na hover (nebo
 * `active`, používané jako loading indikátor v `app/(app)/loading.tsx`) se plynule 3D otáčí a
 * barevně "dýchá" mezi azurovou/tyrkysovou/královskou modří (viz `globals.css`).
 */
export function AnimatedLogo({
  className,
  active = false,
  size = 28,
}: {
  className?: string;
  active?: boolean;
  size?: number;
}) {
  const gradientId = useId();

  return (
    <span
      className={cn("animated-logo", active && "animated-logo--active", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="animated-logo__mark"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>
        <path
          d="M32 84 L32 20 Q32 17 35 17 L54 17 Q74 17 74 37 Q74 55 54 55 L34 55"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22 80 L78 20 M78 20 L59 25 M78 20 L73 39"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
