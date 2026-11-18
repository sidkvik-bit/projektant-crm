import { readFile } from "node:fs/promises";
import path from "node:path";

/** Veřejná nápověda: články jsou markdown v docs/ (jeden zdroj pro GitHub i web).
 * Stránky se generují staticky při buildu, takže soubory se čtou jen tehdy. */
export type HelpArticle = { slug: string; title: string; file: string; group: string };

export const HELP_ARTICLES: HelpArticle[] = [
  { slug: "", title: "Začínáme", file: "napoveda/zaciname.md", group: "Používání" },
  { slug: "ai-asistent", title: "AI asistent", file: "napoveda/ai-asistent.md", group: "Používání" },
  { slug: "upravy-firmy", title: "Přehled úprav", file: "upravy-firmy/README.md", group: "Úpravy firmy" },
  { slug: "pole-a-entity", title: "Pole a entity", file: "upravy-firmy/pole-a-entity.md", group: "Úpravy firmy" },
  { slug: "formulare-a-pohledy", title: "Formuláře a pohledy", file: "upravy-firmy/formulare-a-pohledy.md", group: "Úpravy firmy" },
  { slug: "tlacitka", title: "Tlačítka", file: "upravy-firmy/tlacitka.md", group: "Úpravy firmy" },
  { slug: "skripty", title: "Klientské skripty", file: "upravy-firmy/skripty.md", group: "Úpravy firmy" },
  { slug: "pluginy", title: "Serverové pluginy", file: "upravy-firmy/pluginy.md", group: "Úpravy firmy" },
  { slug: "priklady", title: "Hotové recepty", file: "upravy-firmy/priklady.md", group: "Úpravy firmy" },
];

export const helpHref = (slug: string) => (slug ? `/napoveda/${slug}` : "/napoveda");

/** Odkaz mezi markdowny (`pluginy.md`, `README.md`) → adresa článku na webu. */
export function resolveHelpLink(href: string): string {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || !href.includes(".md")) return href;
  const [file, hash] = href.split("#");
  const base = path.posix.basename(file);
  const article = HELP_ARTICLES.find((a) => path.posix.basename(a.file) === base);
  return article ? helpHref(article.slug) + (hash ? `#${hash}` : "") : href;
}

export function findArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function readArticle(article: HelpArticle): Promise<string> {
  return readFile(path.join(process.cwd(), "docs", article.file), "utf8");
}
