import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchBorrowerMeServer } from "@/lib/borrower-auth-server";
import { HomePageContent } from "./homepage-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

const HOME_TITLE = "Proficient Premium | Borrower Portal";

const HOME_DESCRIPTION =
  "Proficient Premium borrower portal: apply for, manage, and repay your loan online.";

export const metadata: Metadata = {
  title: {
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: "website",
    locale: "en_MY",
    url: "/",
    siteName: "Proficient Premium",
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
        name: "PROFICIENT PREMIUM SDN. BHD.",
        url: base,
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: `${base}/`,
        name: "Proficient Premium",
        description: HOME_DESCRIPTION,
        inLanguage: "en-MY",
        publisher: { "@id": `${base}/#organization` },
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
