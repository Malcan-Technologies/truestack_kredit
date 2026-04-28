import type { ReactNode } from "react";
import { LegalBackLink } from "@borrower_pro/components/legal/legal-back-link";
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";

type LegalPageLayoutProps = {
  children: ReactNode;
};

export function LegalPageLayout({ children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <LegalBackLink className="text-sm text-muted-foreground transition-colors hover:text-foreground" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">{children}</main>
    </div>
  );
}
