import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";

type LegalPageLayoutProps = {
  children: ReactNode;
  /** e.g. "Back to home" for public pages */
  backLabel?: string;
  backHref?: string;
};

export function LegalPageLayout({
  children,
  backLabel = "Back to home",
  backHref = "/",
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href={backHref}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {backLabel}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">{children}</main>
    </div>
  );
}
