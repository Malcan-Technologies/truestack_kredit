import type { Metadata } from "next";
import { LegalPageLayout } from "@/app/components/legal/legal-page-layout";
import { LEGAL_LAST_UPDATED, LENDER_EMAIL, LENDER_LEGAL_NAME, LENDER_NAME } from "@/app/components/legal/proficient-site";

export const metadata: Metadata = {
  title: "PDPA notice",
  description: `PDPA notice for ${LENDER_NAME} borrowers and portal users in Malaysia.`,
};

export default function PdpaPage() {
  return (
    <LegalPageLayout>
      <article className="space-y-8">
        <header className="space-y-2 border-b border-border pb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">PDPA notice</h1>
          <p className="text-sm text-muted-foreground">
            Notice and choice under Malaysia&apos;s Personal Data Protection Act 2010 (PDPA) for
            this borrower portal and related services operated by {LENDER_LEGAL_NAME}.
          </p>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">1. Scope of this notice</h2>
            <p>
              This notice explains how {LENDER_LEGAL_NAME} (&quot;we&quot;, &quot;us&quot;) collects, uses, stores, and
              discloses personal data in connection with the borrower portal, online applications, loan
              origination and servicing, and communications with you. We process data in line with
              the Personal Data Protection Act 2010 (Act 709) and applicable Malaysian requirements.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">2. Services covered</h2>
            <p>Personal data may be processed for purposes including:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Borrower accounts, onboarding, and authentication</li>
              <li>Loan applications, assessment, approval workflows, and disbursement</li>
              <li>Loan servicing, repayments, collections, and related records</li>
              <li>Identity verification and fraud prevention, where used</li>
              <li>Regulatory, audit, and legal compliance (including KPKT licensing as applicable)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">3. Personal data we process</h2>
            <p>Depending on your relationship with us, we may process:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Identity and contact data (name, MyKad/passport or other ID numbers, date of birth,
                address, phone, email)
              </li>
              <li>Employment, income, and financial information needed for credit decisions</li>
              <li>
                KYC media and related outputs (e.g. document images, OCR fields, selfie/liveness) where
                those flows are used
              </li>
              <li>Bank and payment details, loan and repayment history</li>
              <li>Technical and security data (e.g. IP address, device/browser, logs, timestamps)</li>
            </ul>
            <p>
              Some processing may involve sensitive personal data under the PDPA (for example, biometric
              data where used for identity verification).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">4. Why we process data</h2>
            <p>We process personal data to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Assess and decide on applications, and to originate and service loans</li>
              <li>Verify identity, prevent fraud, and protect our systems</li>
              <li>Meet legal, regulatory, and audit obligations for licensed moneylending</li>
              <li>Communicate with you and provide customer support</li>
              <li>Defend or pursue legal rights, and for internal operations and quality improvement</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">5. Disclosure and transfers</h2>
            <p>We may disclose personal data to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Service providers that host, secure, or support our IT, messaging, and operations</li>
              <li>Credit bureaus, identity or fraud service providers, and professional advisers</li>
              <li>Regulators, courts, or law enforcement when required or permitted by law</li>
              <li>Related entities where permitted and for legitimate business purposes</li>
            </ul>
            <p>We do not sell your personal data. Cross-border transfers, where they occur, are managed in line with PDPA and applicable safeguards.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              6. Third-party processors
            </h2>
            <p>
              Where we appoint processors, we require appropriate contractual and security measures.
              Categories may include identity verification, hosting, email/SMS, payment rails, and
              credit information services. We share only what is needed for the relevant purpose.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">7. Security and retention</h2>
            <p>
              We apply technical and organisational measures (including access control, encryption in
              transit, and protected storage) appropriate to the sensitivity of the data. Data is
              retained only as long as necessary for the purposes above, and for legal, regulatory, and
              dispute needs.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">8. Your rights under the PDPA</h2>
            <p>Subject to legal limitations, you may have the right to request:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Access to personal data we hold about you</li>
              <li>Correction of inaccurate, incomplete, or outdated data</li>
              <li>Withdrawal of consent or limitation of certain processing, where applicable</li>
            </ul>
            <p>
              Contact us at{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>{" "}
              to make a request. We may ask for information to verify your identity. A fee may apply where
              permitted by law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">9. Contact</h2>
            <p>
              For questions about this notice or to exercise your rights, write to {LENDER_NAME} at{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>
              . See also our{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/privacy"
              >
                Privacy policy
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </LegalPageLayout>
  );
}
