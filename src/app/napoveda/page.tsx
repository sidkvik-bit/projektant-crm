import type { Metadata } from "next";
import { HELP_ARTICLES, readArticle } from "./articles";
import { Markdown } from "./Markdown";

export const metadata: Metadata = { title: "Nápověda — ProjektantCRM" };

export default async function HelpHomePage() {
  return <Markdown source={await readArticle(HELP_ARTICLES[0])} />;
}
