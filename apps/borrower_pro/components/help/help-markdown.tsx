import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@borrower_pro/components/help/mermaid-diagram";
import { cn } from "@borrower_pro/lib/utils";

type HelpMarkdownProps = {
  content: string;
  className?: string;
};

type MarkdownCodeProps = ComponentPropsWithoutRef<"code"> & {
  inline?: boolean;
  children?: ReactNode;
};

type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & {
  href?: string;
};

export function HelpMarkdown({ content, className }: HelpMarkdownProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ className: headingClassName, ...props }) => (
            <h1
              className={cn(
                "font-heading text-3xl font-semibold tracking-tight text-foreground",
                headingClassName
              )}
              {...props}
            />
          ),
          h2: ({ className: headingClassName, ...props }) => (
            <h2
              className={cn(
                "mt-10 scroll-m-20 border-b border-border pb-3 font-heading text-2xl font-semibold tracking-tight text-foreground first:mt-0",
                headingClassName
              )}
              {...props}
            />
          ),
          h3: ({ className: headingClassName, ...props }) => (
            <h3
              className={cn(
                "mt-8 scroll-m-20 font-heading text-xl font-semibold tracking-tight text-foreground",
                headingClassName
              )}
              {...props}
            />
          ),
          p: ({ className: paragraphClassName, ...props }) => (
            <p
              className={cn(
                "leading-7 text-foreground/95 [&:not(:first-child)]:mt-4",
                paragraphClassName
              )}
              {...props}
            />
          ),
          strong: ({ className: strongClassName, ...props }) => (
            <strong
              className={cn("font-semibold text-foreground", strongClassName)}
              {...props}
            />
          ),
          ul: ({ className: listClassName, ...props }) => (
            <ul
              className={cn(
                "my-4 ml-6 list-disc space-y-2 text-foreground/95",
                listClassName
              )}
              {...props}
            />
          ),
          ol: ({ className: listClassName, ...props }) => (
            <ol
              className={cn(
                "my-4 ml-6 list-decimal space-y-2 text-foreground/95",
                listClassName
              )}
              {...props}
            />
          ),
          li: ({ className: itemClassName, ...props }) => (
            <li className={cn("pl-1", itemClassName)} {...props} />
          ),
          hr: ({ className: hrClassName, ...props }) => (
            <hr className={cn("my-8 border-border", hrClassName)} {...props} />
          ),
          table: ({ className: tableClassName, ...props }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-border">
              <table
                className={cn(
                  "min-w-full border-collapse text-sm",
                  tableClassName
                )}
                {...props}
              />
            </div>
          ),
          thead: ({ className: tableClassName, ...props }) => (
            <thead
              className={cn("bg-secondary/60 text-left", tableClassName)}
              {...props}
            />
          ),
          th: ({ className: tableClassName, ...props }) => (
            <th
              className={cn(
                "border-b border-border px-4 py-3 font-medium text-foreground",
                tableClassName
              )}
              {...props}
            />
          ),
          td: ({ className: tableClassName, ...props }) => (
            <td
              className={cn(
                "border-t border-border px-4 py-3 align-top text-muted-foreground",
                tableClassName
              )}
              {...props}
            />
          ),
          a: ({ href, className: anchorClassName, children, ...props }: MarkdownLinkProps) => {
            const classes = cn(
              "font-medium text-primary underline underline-offset-4 transition-opacity hover:opacity-80",
              anchorClassName
            );

            if (href?.startsWith("/")) {
              return (
                <Link href={href} className={classes}>
                  {children}
                </Link>
              );
            }

            return (
              <a
                href={href}
                className={classes}
                target="_blank"
                rel="noreferrer noopener"
                {...props}
              >
                {children}
              </a>
            );
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className: codeClassName, inline, children, ...props }: MarkdownCodeProps) => {
            const value = String(children ?? "").replace(/\n$/, "");

            if (!inline && codeClassName === "language-mermaid") {
              return <MermaidDiagram chart={value} />;
            }

            if (inline) {
              return (
                <code
                  className={cn(
                    "rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]",
                    codeClassName
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="my-6 overflow-x-auto rounded-xl border border-border bg-card">
                <code
                  className={cn(
                    "block min-w-full p-4 font-mono text-sm text-foreground",
                    codeClassName
                  )}
                  {...props}
                >
                  {value}
                </code>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
