import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of use | Demo Client",
  description: "Terms of use for the borrower portal",
};

export default function TermsOfUsePage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Terms of use
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {new Date().toISOString().slice(0, 10)} · Template — replace with counsel-approved terms before production.
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            1. Agreement
          </h2>
          <p>
            By accessing or using this borrower portal (the &quot;Service&quot;), you agree to these Terms of Use. If you do not agree, do not use the Service. The money lender operating this deployment (&quot;we&quot;, &quot;us&quot;, &quot;lender&quot;) may update these terms; continued use after changes constitutes acceptance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            2. Eligibility &amp; accounts
          </h2>
          <p>
            You must provide accurate information and keep your login credentials confidential. You are responsible for activity under your account. Notify us promptly of any unauthorised use.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            3. Use of the Service
          </h2>
          <p>
            The Service is provided for submitting and managing loan-related information with this lender. You must not misuse the Service, attempt unauthorised access, scrape data, or use it for unlawful purposes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            4. Loan products
          </h2>
          <p>
            Any loan offer, agreement, or disbursement is governed by separate loan documentation and applicable law (including KPKT licensing requirements where relevant). Nothing in these terms guarantees approval or specific terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            5. Disclaimers &amp; limitation
          </h2>
          <p>
            The Service is provided &quot;as is&quot; to the extent permitted by law. We do not warrant uninterrupted or error-free operation. Liability is limited as permitted by applicable law; some jurisdictions do not allow certain limitations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            6. Contact
          </h2>
          <p>
            For questions about these terms, use the contact details shown on the About page in the borrower portal or as otherwise published by the lender.
          </p>
        </section>
      </div>
    </article>
  );
}
