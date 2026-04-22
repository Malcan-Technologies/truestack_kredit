import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth-server"
import { LandingPage } from "@/components/landing/landing-page"

/** Hostname only, lowercased (no port). */
function hostnameFromForwardedHeader(hostHeader: string | null): string {
  if (!hostHeader) return ""
  const first = hostHeader.split(",")[0]?.trim() ?? ""
  const noPort = first.includes(":") ? (first.split(":")[0] ?? "") : first
  return noPort.toLowerCase()
}

/**
 * Public marketing landing is only served on allowlisted hosts (default: demo-admin.truestack.my).
 * Other deployments redirect `/` to `/login`, or `/dashboard` when already signed in.
 * Set `NEXT_PUBLIC_LANDING_PAGE_HOSTS` to a comma-separated list; use an empty value for none.
 */
function isPublicMarketingLandingHost(hostname: string): boolean {
  const raw =
    process.env.NEXT_PUBLIC_LANDING_PAGE_HOSTS ?? "demo-admin.truestack.my"
  const allowed = raw
    .split(",")
    .map((h) => {
      const t = h.trim().toLowerCase()
      return t.includes(":") ? (t.split(":")[0] ?? t) : t
    })
    .filter(Boolean)
  return allowed.includes(hostname)
}

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

export default async function Home() {
  const h = await headers()
  const host =
    hostnameFromForwardedHeader(h.get("x-forwarded-host")) ||
    hostnameFromForwardedHeader(h.get("host"))

  if (!isPublicMarketingLandingHost(host)) {
    const session = await auth.api.getSession({ headers: h })
    redirect(session ? "/dashboard" : "/login")
  }

  return <LandingPage />
}
