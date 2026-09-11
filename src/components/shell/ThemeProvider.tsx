"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Tmavý režim je výchozí (odpovídá schválenému vizuálu), ale jde přepnout — viz
 * ThemeToggle.tsx v Sidebaru. `enableSystem={false}`: jen dvě jasné volby (Světlý/Tmavý),
 * ne třetí "podle systému" stav, který by se v UI musel nějak reprezentovat navíc.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
