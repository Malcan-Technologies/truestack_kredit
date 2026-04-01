import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy | Demo Client",
  description: "Privacy policy for the borrower portal",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Privacy policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            1. Who we are
          </h2>
          <p>
            This policy describes how the lender operating this borrower portal collects, uses, stores, and shares personal information. For Malaysia-specific rights and notices, see also our PDPA notice.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            2. Information we collect
          </h2>
          <p>We may collect, for example:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Identity and contact details (name, email, phone, address, identification numbers)</li>
            <li>Financial and employment information relevant to credit decisions</li>
            <li>Documents you upload (e.g. IC, bank statements) and metadata</li>
            <li>Technical data (IP address, device/browser type, logs) for security and service operation</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            3. How we use information
          </h2>
          <p>We use personal information to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Assess applications, originate and service loans, and meet regulatory obligations</li>
            <li>Verify identity, prevent fraud, and protect the Service</li>
            <li>Communicate with you about your account and applications</li>
            <li>Improve the Service and comply with law</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            4. Sharing
          </h2>
          <p>
            We may share information with service providers (hosting, messaging, credit bureaus, identity checks), regulators where required, and professional advisers. We do not sell your personal information. Transfers may include cross-border processing where permitted and safeguarded as required by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            5. Retention &amp; security
          </h2>
          <p>
            We retain data for as long as needed for the purposes above and to meet legal and audit requirements. We apply appropriate technical and organisational measures; no system is completely secure.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            6. Your choices
          </h2>
          <p>
            You may have rights to access, correct, or object to certain processing depending on applicable law. Contact us using the details on the About page. You may also lodge a complaint with a supervisory authority where applicable.
          </p>
        </section>
      </div>
    </article>
  );
}
