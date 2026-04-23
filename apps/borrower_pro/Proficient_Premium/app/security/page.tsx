import type { Metadata } from "next";
import { LegalPageLayout } from "@/app/components/legal/legal-page-layout";
import { LEGAL_LAST_UPDATED, LENDER_EMAIL, LENDER_LEGAL_NAME, LENDER_NAME } from "@/app/components/legal/proficient-site";

export const metadata: Metadata = {
  title: "Cybersecurity",
  description: `How ${LENDER_NAME} approaches security for the borrower portal and related services.`,
};

export default function SecurityPage() {
  return (
    <LegalPageLayout>
      <article className="space-y-8">
        <header className="space-y-2 border-b border-border pb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Cybersecurity
          </h1>
          <p className="text-sm text-muted-foreground">
            How {LENDER_NAME} designs, operates, and protects systems used to deliver our borrower
            portal and regulated lending services in Malaysia.
          </p>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              1. Purpose and scope
            </h2>
            <p>
              This statement provides a public overview of security practices for{" "}
              {LENDER_LEGAL_NAME} in connection with this borrower portal, online applications, loan
              servicing, identity verification, and related interfaces we operate or procure for
              you.
            </p>
            <p>
              It is a high-level summary for customers and partners. Additional contractual,
              technical, or regulatory controls may apply to specific products or agreements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              2. Security principles
            </h2>
            <p className="font-medium text-foreground">Malaysia-aligned hosting and data handling</p>
            <p>
              We design our services around Malaysian data residency and regulatory expectations, using
              infrastructure and providers that support our compliance obligations.
            </p>
            <p className="font-medium text-foreground">Protected access</p>
            <p>
              Administrative and operational access is restricted through role-based permissions and
              controlled access paths to sensitive systems and data.
            </p>
            <p className="font-medium text-foreground">Secure applications and APIs</p>
            <p>
              Customer-facing services are built with protected transport, authenticated APIs, and
              controls intended to reduce unauthorised access to accounts and records.
            </p>
            <p className="font-medium text-foreground">Monitoring and traceability</p>
            <p>
              We maintain monitoring, logging, and audit trail capabilities to support operational
              visibility, investigations, and compliance readiness.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              3. Controls we may apply
            </h2>
            <p>Depending on the service and environment, our controls may include:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Encryption in transit and protected storage for sensitive records</li>
              <li>Role-based access control for staff and approved operational users</li>
              <li>Centralised logging and audit trails for important platform actions</li>
              <li>Monitoring and alerting to support detection and response</li>
              <li>Resilient infrastructure aligned with our service continuity objectives</li>
            </ul>
            <p>
              Workflows that involve financial, identity, or biometric data are subject to stricter
              access, handling, and monitoring expectations.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              4. Identity verification and loan records
            </h2>
            <p>
              Where e-KYC or document verification is used, flows may include document capture, data
              extraction, selfie and liveness checks, and verification outcomes, in line with our{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/pdpa"
              >
                PDPA notice
              </a>{" "}
              and service providers&apos; terms.
            </p>
            <p>
              Loan-related environments may hold borrower profiles, application and loan records,
              repayment information, and audit-ready documentation as required for licensed
              moneylending.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              5. Incident detection and response
            </h2>
            <p>We work to detect, assess, contain, and recover from security events in a timely manner.</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Investigate suspicious activity or anomalous system behaviour</li>
              <li>Contain affected services or access when necessary</li>
              <li>Restore operations and review preventive improvements</li>
              <li>
                Notify affected individuals, regulators, or partners when required by law, contract, or
                regulatory obligation
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              6. Your responsibilities
            </h2>
            <p>Security is shared. Please help protect your account and our services by:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Keeping login credentials private and not sharing your account</li>
              <li>Using strong passwords and our supported sign-in options</li>
              <li>Reporting suspected misuse, vulnerabilities, or incidents promptly</li>
              <li>Using up-to-date devices and browsers when accessing the portal</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">7. Policy review</h2>
            <p>
              We may update this page from time to time. Changes will be published here with a revised
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">8. Contact</h2>
            <p>
              To report a security concern or ask about our security practices, contact{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>
              .
            </p>
            <p>
              You may also refer to our{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/privacy"
              >
                Privacy policy
              </a>{" "}
              and{" "}
              <a className="font-medium text-foreground underline-offset-4 hover:underline" href="/pdpa">
                PDPA notice
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </LegalPageLayout>
  );
}
