import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDPA notice | Pinjocep",
  description: "Personal Data Protection Act (Malaysia) notice for borrowers",
};

export default function PdpaNoticePage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          PDPA notice
        </h1>
        <p className="text-sm text-muted-foreground">
          Personal Data Protection Act 2010 (Malaysia). Last updated:{" "}
          {new Date().toISOString().slice(0, 10)}.
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            1. Data user
          </h2>
          <p>
            The licensed moneylender operating this portal is a data user under the Personal Data Protection Act 2010 (&quot;PDPA&quot;). This notice explains how your personal data is processed in connection with the borrower portal and lending activities.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            2. Personal data collected
          </h2>
          <p>
            We may collect personal data including but not limited to: name, identification numbers, contact details, address, employment and income information, bank details, photographs or copies of identity documents, credit-related information, and technical data from your use of the Service.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            3. Purposes
          </h2>
          <p>Your personal data may be processed for purposes including:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Evaluating and processing loan applications and guarantees</li>
            <li>Administering loans, collections, and recoveries</li>
            <li>Compliance with KPKT licensing, anti-money laundering, and other legal obligations</li>
            <li>Credit checks, fraud prevention, and risk management</li>
            <li>Communication and customer support</li>
            <li>Internal audit, reporting, and service improvement</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            4. Disclosure
          </h2>
          <p>
            Personal data may be disclosed to related companies, service providers, credit reporting agencies, regulators, courts, or other parties where the PDPA or law permits or requires. Reasonable steps are taken to ensure recipients protect your data appropriately.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            5. Rights
          </h2>
          <p>
            Subject to the PDPA, you may have rights to request access to, or correction of, your personal data, and in some circumstances to limit processing. Requests should be submitted through the contact channel identified on the About page. We may charge a fee where permitted.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            6. Obligation to provide data
          </h2>
          <p>
            Where personal data is required for a loan decision or legal compliance, failure to provide it may mean we cannot proceed with your application or continue the relationship.
          </p>
        </section>
      </div>
    </article>
  );
}
