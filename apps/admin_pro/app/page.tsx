import type { Metadata } from "next"
import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: {
    absolute: "TrueKredit™ Pro — Lending operations for Malaysian money lenders",
  },
  description:
    "TrueKredit Pro is a dedicated lending operations platform for licensed money lenders in Malaysia: physical and digital KPKT-aligned workflows, borrower origination, TrueIdentity e-KYC, TrueSend notifications, admin dashboards, and compliance-oriented exports.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TrueKredit™ Pro — Lending operations for Malaysian money lenders",
    description:
      "Origination, servicing, e-KYC, automated borrower communications, and compliance exports — built for licensed money lending in Malaysia.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit™ Pro",
    description:
      "Operations platform for licensed money lenders — physical & digital KPKT, e-KYC, and admin controls in one deployment.",
  },
}

export default function Home() {
  return <LandingPage />
}
