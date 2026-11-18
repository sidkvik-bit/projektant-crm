import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HELP_ARTICLES, findArticle, readArticle } from "../articles";
import { Markdown } from "../Markdown";

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_ARTICLES.filter((a) => a.slug).map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = findArticle((await params).slug);
  return { title: `${article?.title ?? "Nápověda"} — Nápověda ProjektantCRM` };
}

export default async function HelpArticlePage({ params }: Props) {
  const article = findArticle((await params).slug);
  if (!article) notFound();
  return <Markdown source={await readArticle(article)} />;
}
