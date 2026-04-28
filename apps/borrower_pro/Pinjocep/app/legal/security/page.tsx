import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security policy | Pinjocep",
  description: "Security policy for the borrower portal",
};

export default function SecurityPolicyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Security policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            1. Our approach
          </h2>
          <p>
            We aim to protect borrower information with appropriate safeguards designed to support
            privacy, confidentiality, integrity, and availability. This page provides a general
            overview and does not describe every internal control in detail.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            2. Data protection
          </h2>
          <p>
            Sensitive information, including account data, e-KYC information, identity documents,
            and loan records, is protected using encryption and related safeguards. Data for this
            service is stored in Malaysia, kept encrypted, and backed up to support resilience and
            recovery. The website is also protected using SSL/TLS encryption to help secure data in
            transit between users and the portal.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            3. e-KYC and identity documents
          </h2>
          <p>
            e-KYC data and identity documents are used for identity verification, fraud prevention,
            compliance, safe lending, and related loan operations. Access to such data should be
            limited to authorized personnel and approved providers who need it for legitimate
            operational or compliance purposes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            4. Passwords and account security
          </h2>
          <p>
            Passwords are protected using secure handling practices and are not intended to be
            exposed or stored in plain text through normal use of the portal. Users should keep
            login credentials private, use strong passwords, and notify us promptly if they suspect
            unauthorized access.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            5. Digital signing
          </h2>
          <p>
            Verified identity information may be used to support issuance of a digital signing
            certificate for PKI signing. This helps link the signing process to the verified
            borrower and helps protect the integrity of the signed agreement.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            6. Related policies
          </h2>
          <p>
            For more information, please also review our Terms of Use, Privacy Policy, PDPA Notice,
            and Cookie Policy.
          </p>
        </section>
      </div>
    </article>
  );
}
