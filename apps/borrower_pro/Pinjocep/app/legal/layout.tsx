import { LegalBackLink } from "@borrower_pro/components/legal/legal-back-link";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10 lg:py-14">
        <p className="mb-8">
          <LegalBackLink className="text-sm text-muted-foreground transition-colors hover:text-foreground" />
        </p>
        {children}
      </main>
    </div>
  );
}
