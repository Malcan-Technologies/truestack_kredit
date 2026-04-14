import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchBorrowerMeServer } from "@/lib/borrower-auth-server";
import { HomePageContent } from "./homepage-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3006";

const HOME_TITLE =
  "KPKT Digital Lending Licence Demo | Borrower Website Sample | TrueStack";

const HOME_DESCRIPTION =
  "Explore a public borrower demo for Malaysian licensed money lenders: KPKT digital lending licence UX, affordability preview, and sign-up. TrueStack supports digital licence conversion and lending platforms—this site is not a real lender.";

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
    "licensed money lender demo",
    "borrower portal demo",
    "TrueStack",
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
    siteName: "TrueStack Demo Client",
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
        name: "TRUESTACK TECHNOLOGIES SDN. BHD.",
        url: "https://truestack.my",
        email: "hello@truestack.my",
        sameAs: ["https://truestack.my", "https://www.truestack.my"],
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: `${base}/`,
        name: "TrueStack Demo Client",
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
            "Demonstration of a borrower-facing website for Malaysian licensed money lenders pursuing or operating under a KPKT digital lending licence.",
        },
      },
    ],
  };
}

export default async function HomePage() {
  const res = await fetchBorrowerMeServer();
  if (res?.success) {
    if (res.data.profileCount > 0) {
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

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
