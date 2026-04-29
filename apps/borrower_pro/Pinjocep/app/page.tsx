import type { Metadata } from "next";
import { HomePageContent } from "./homepage-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3008";

const HOME_TITLE = "Pinjocep | Borrower portal";

const HOME_DESCRIPTION =
  "Pinjocep borrower portal: apply for, manage, and repay your loan online. Licensed money lender services in Malaysia and KPKT digital lending support.";

export const metadata: Metadata = {
  title: {
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  keywords: [
    "KPKT digital licence",
    "KPKT digital license",
    "KPKT digital lending licence",
    "digital moneylending Malaysia",
    "licensed money lender",
    "borrower portal",
    "Pinjocep",
    "TrueKredit",
    "digital licence conversion",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_MY",
    url: "/",
    siteName: "Pinjocep",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
};

function homeJsonLd() {
  const base = appUrl.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "Pinjocep",
        url: "https://pinjocep.my",
        email: "hello@pinjocep.my",
        sameAs: ["https://pinjocep.my", "https://www.pinjocep.my"],
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: `${base}/`,
        name: "Pinjocep",
        description: HOME_DESCRIPTION,
        inLanguage: "en-MY",
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${base}/#webpage`,
        url: `${base}/`,
        name: HOME_TITLE,
        description: HOME_DESCRIPTION,
        isPartOf: { "@id": `${base}/#website` },
        about: {
          "@type": "Thing",
          name: "KPKT digital lending licence",
          description:
            "Borrower-facing services for Malaysian licensed money lenders under a KPKT digital lending licence.",
        },
      },
    ],
  };
}

export default async function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()) }}
      />
      <HomePageContent />
    </>
  );
}
