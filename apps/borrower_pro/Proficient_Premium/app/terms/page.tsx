import type { Metadata } from "next";
import { LegalPageLayout } from "@/app/components/legal/legal-page-layout";
import { LEGAL_LAST_UPDATED, LENDER_EMAIL, LENDER_LEGAL_NAME, LENDER_NAME } from "@/app/components/legal/proficient-site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `Terms and conditions for using the ${LENDER_NAME} borrower portal and website.`,
};

export default function TermsPage() {
  return (
    <LegalPageLayout>
      <article className="space-y-8">
        <header className="space-y-2 border-b border-border pb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">Terms of use</h1>
          <p className="text-sm text-muted-foreground">
            Terms and conditions for accessing this borrower portal and our online services, operated
            by {LENDER_LEGAL_NAME}.
          </p>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">1. Acceptance of terms</h2>
            <p>
              By creating an account, accessing, or using this borrower portal and related online
              services (the &quot;Service&quot;), you agree to these Terms of use. If you do not agree, do
              not use the Service. We may update these terms; continued use after we post changes
              constitutes acceptance, except where a stricter process is required by law. We
              recommend checking this page periodically.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">2. About {LENDER_NAME}</h2>
            <p>
              {LENDER_LEGAL_NAME} is a licensed money lender in Malaysia. This portal is provided to
              support loan applications, servicing, and related borrower interactions. General
              information on the site is for your understanding and does not replace information in
              your loan agreement, credit offer, or statutory disclosures.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">3. Eligibility and accounts</h2>
            <p>
              You must be eligible to use the Service under Malaysian law and our policies. You must
              provide accurate information, keep your login credentials secure, and notify us
              promptly of any unauthorised use. You are responsible for activity under your account
              except where we are at fault.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">4. Use of the Service</h2>
            <p>You agree to use the Service only for lawful purposes. You must not:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Infringe the rights of others or misuse the Service</li>
              <li>Attempt to gain unauthorised access to systems, data, or other users&apos; accounts</li>
              <li>Interfere with the operation of the Service or introduce harmful code</li>
              <li>Use the Service to commit fraud, harassment, or any unlawful act</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">5. Applications, offers, and loans</h2>
            <p>
              Any loan, credit decision, or disbursement is subject to our assessment, approval, and
              separate written documentation (and applicable KPKT and licensing requirements). Nothing
              on this site or in the online calculator (if shown) is a binding offer unless we confirm
              it in a formal way allowed by law. Indicative figures, calculators, and marketing copy
              are not substitutes for the terms in your agreement.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">6. Intellectual property</h2>
            <p>
              Content, branding, and software in the Service are owned by {LENDER_LEGAL_NAME} or our
              licensors. You may not copy, modify, distribute, or create derivative works except as
              allowed by us in writing or by applicable law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">7. Information accuracy</h2>
            <p>
              We work to keep information on the Service accurate, but it may change. Products,
              rates, and eligibility are subject to change. For the current position, rely on
              communications we send you and your contractual documents.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">8. No professional advice</h2>
            <p>
              Content on the Service is general information, not financial, tax, or legal advice. You
              should obtain independent professional advice for your situation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">9. Third-party links</h2>
            <p>
              Links to third parties are for convenience. We are not responsible for their content or
              practices.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              10. Disclaimers and limitation of liability
            </h2>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, to the fullest extent
              permitted by law. We do not warrant uninterrupted or error-free operation. We exclude or
              limit liability where the law allows; some rights cannot be excluded and nothing in
              these terms is intended to override mandatory consumer protections.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">11. Indemnity</h2>
            <p>
              You agree to indemnify and hold {LENDER_LEGAL_NAME} harmless against claims arising
              from your misuse of the Service or violation of these terms, to the extent permitted by
              law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">12. Governing law</h2>
            <p>
              These terms are governed by the laws of Malaysia. Courts of Malaysia have jurisdiction
              subject to any mandatory requirements that apply to you.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">13. Privacy and PDPA</h2>
            <p>
              Our use of your personal data is described in the{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/privacy"
              >
                Privacy policy
              </a>{" "}
              and{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/pdpa"
              >
                PDPA notice
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">14. Contact</h2>
            <p>
              For questions about these terms, contact:{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </article>
    </LegalPageLayout>
  );
}
