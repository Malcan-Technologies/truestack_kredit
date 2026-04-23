import type { Metadata } from "next";
import { LegalPageLayout } from "@/app/components/legal/legal-page-layout";
import {
  LEGAL_LAST_UPDATED,
  LENDER_ADDRESS_LINES,
  LENDER_EMAIL,
  LENDER_LEGAL_NAME,
  LENDER_NAME,
  LENDER_PHONE,
  LENDER_PHONE_HREF,
  LENDER_WEB,
} from "@/app/components/legal/proficient-site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${LENDER_NAME} collects, uses, and protects your personal information.`,
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout>
      <article className="space-y-8">
        <header className="space-y-2 border-b border-border pb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">
            How {LENDER_LEGAL_NAME} collects, uses, discloses, and safeguards your information when
            you use the {LENDER_NAME} borrower portal and related services in Malaysia.
          </p>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">1. Introduction</h2>
            <p>
              {LENDER_LEGAL_NAME} (&quot;we&quot;, &quot;us&quot; or &quot;{LENDER_NAME}&quot;) is committed to protecting your privacy.
              This policy explains our practices in line with the Personal Data Protection Act 2010
              (PDPA) and our{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/pdpa"
              >
                PDPA notice
              </a>
              , which contains further Malaysia-specific information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">2. Information we collect</h2>
            <p className="font-medium text-foreground">Information you provide</p>
            <p>We may collect information you provide, for example:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Name, identification numbers, and contact details</li>
              <li>Employment, income, and financial information for credit assessment</li>
              <li>Documents you upload, and information you provide in applications or support requests</li>
            </ul>
            <p className="font-medium text-foreground">Information collected automatically</p>
            <p>When you use our portal, we may automatically collect technical data such as:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Browser type and version, operating system</li>
              <li>IP address and approximate location data derived from it</li>
              <li>Pages viewed, time on page, and similar usage signals for security and improvement</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">3. How we use your information</h2>
            <p>We use personal information to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Process applications, originate and service loans, and meet legal obligations</li>
              <li>Verify identity, prevent fraud, and keep the service secure</li>
              <li>Communicate with you about your account, applications, and servicing</li>
              <li>Improve our systems and, where allowed, for analytics in aggregated or de-identified form</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">4. Disclosure of your information</h2>
            <p>We may share your information with:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Service providers that assist in hosting, security, identity checks, and operations</li>
              <li>Credit reporting or fraud service providers, where used for assessment</li>
              <li>Professional advisers, regulators, or authorities when required or permitted by law</li>
            </ul>
            <p>We do not sell your personal information to third parties for their marketing.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">5. Data security</h2>
            <p>
              We apply appropriate technical and organisational measures to protect your information.
              No method of transmission or storage is completely secure; you should also protect your
              account credentials. See our{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/security"
              >
                Cybersecurity
              </a>{" "}
              page for an overview of our approach.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">6. Data retention</h2>
            <p>
              We keep personal data only for as long as needed for the purposes above, including
              legal, tax, and audit retention periods for licensed moneylending.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">7. Your rights</h2>
            <p>
              Under the PDPA you may have rights to access, correct, or in some cases limit processing
              of your data. You may also have further rights in specific situations. To exercise your
              rights, contact us at{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>
              . You can also raise concerns with a regulator where you have a right to do so.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">8. Cookies and similar technologies</h2>
            <p>
              Our services may use cookies and similar technologies for security, sign-in, preferences,
              and to understand how the site is used. You can control cookies through your browser
              settings; disabling some cookies may affect how the portal works. More detail may be
              provided in a separate cookie notice where we use non-essential cookies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">9. Third-party links</h2>
            <p>
              The portal or our public site may link to third parties. We are not responsible for
              their privacy practices; please read their policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">10. Changes to this policy</h2>
            <p>We may update this policy and will post the revised version on this page with a new &quot;Last updated&quot; date.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-foreground">11. Contact us</h2>
            <p>
              Questions about this Privacy policy:{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={`mailto:${LENDER_EMAIL}`}
              >
                {LENDER_EMAIL}
              </a>
              {" · "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={LENDER_PHONE_HREF}
              >
                {LENDER_PHONE}
              </a>
            </p>
            <p className="text-sm">
              <span className="text-foreground/80">Registered address</span>
              <br />
              {LENDER_ADDRESS_LINES.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
            <p className="text-xs text-muted-foreground">
              Web:{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href={LENDER_WEB}
                target="_blank"
                rel="noopener noreferrer"
              >
                {LENDER_WEB.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </p>
          </section>
        </div>
      </article>
    </LegalPageLayout>
  );
}
