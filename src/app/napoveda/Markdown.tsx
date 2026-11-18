import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveHelpLink } from "./articles";

/** Vykreslí článek nápovědy. Odkazy mezi .md soubory převede na adresy /napoveda/…. */
export function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href = "", children }) => {
          const target = resolveHelpLink(href);
          return target.startsWith("/") ? (
            <Link href={target}>{children}</Link>
          ) : (
            <a href={target} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
