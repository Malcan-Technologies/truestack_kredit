import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: {
    absolute:
      "TrueKredit™ Core — KPKT loan operations for Malaysian money lenders (subscription)",
  },
  description:
    "TrueKredit Core is a subscription-based, multi-tenant admin platform for licensed money lenders in Malaysia: staff-led origination (no online self-serve loans), L1/L2 review, servicing, optional TrueIdentity and TrueSend modules, plans and billing, and compliance-oriented exports.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TrueKredit™ Core — Staff-led lending operations by plan",
    description:
      "KPKT-aligned loan management for PPW/PPG operations: tenant RBAC, staged application review, servicing, and exports — without a borrower online loan funnel on Core.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit™ Core",
    description:
      "Subscription loan operations for Malaysian licensed lenders — staff-led origination, plans, and optional modules.",
  },
};

export default function Home() {
  return <LandingPage />;
}
