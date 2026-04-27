import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie policy | Pinjocep",
  description: "How this borrower portal uses cookies and similar technologies",
};

export default function CookiePolicyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2 border-b border-border pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Cookie policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {new Date().toISOString().slice(0, 10)}
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            1. What are cookies?
          </h2>
          <p>
            Cookies are small text files stored on your device when you visit a website. Similar technologies include local storage and session tokens. They help the site function, stay secure, and remember preferences.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            2. How we use them
          </h2>
          <p>We use cookies and similar technologies to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-foreground font-medium">Strictly necessary:</span> keep you signed in, maintain session security, and route requests (e.g. authentication cookies).
            </li>
            <li>
              <span className="text-foreground font-medium">Functional:</span> remember choices such as theme (light/dark) where applicable.
            </li>
            <li>
              <span className="text-foreground font-medium">Analytics (if enabled):</span> understand aggregate usage to improve the Service — only where you have implemented such tools and obtained consent if required.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            3. Third parties
          </h2>
          <p>
            Embedded content or integrations (e.g. messaging widgets, maps) may set their own cookies. Review those providers&apos; policies. We do not control third-party cookies unless stated.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            4. Managing cookies
          </h2>
          <p>
            You can block or delete cookies through your browser settings. Blocking strictly necessary cookies may prevent sign-in or core features from working.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            5. Contact
          </h2>
          <p>
            Questions about this policy can be directed to the lender using the contact details on the About page in the borrower portal.
          </p>
        </section>
      </div>
    </article>
  );
}
