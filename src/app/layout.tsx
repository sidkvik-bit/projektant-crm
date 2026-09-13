import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ověřovací token pro Google Search Console nepatří napevno do kódu — je vázaný na Google účet
// a na konkrétní ověřované prostředí, takže se bere z proměnné GOOGLE_SITE_VERIFICATION.
// Vykreslí se jen tam, kde je nastavená (dnes dev i produkční Vercel projekt); prostředí bez ní
// tag vůbec nemá. Změna rozsahu = přidat/odebrat proměnnou, žádný zásah do kódu.
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  // Název musí sedět s "App name" v Google Cloud Console (OAuth consent screen) — Google při
  // ověřování appky porovnává název na domovské stránce s tím, co je v konzoli.
  title: "ProjektantCRM — CRM pro projektanty a projekční kanceláře",
  description:
    "ProjektantCRM je CRM pro projektanty a projekční kanceláře: zájemci, obchodní vztahy, kontakty, projekty s milníky a termíny, nabídky a faktury s QR platbou, napojení na Google Drive a Gmail.",
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="cs"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
