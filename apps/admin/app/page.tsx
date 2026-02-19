import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    absolute: "TrueKredit - Loan Management Platform",
  },
  description: "Multi-tenant loan management platform for lenders",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TrueKredit - Loan Management Platform",
    description: "Multi-tenant loan management platform for lenders",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit - Loan Management Platform",
    description: "Multi-tenant loan management platform for lenders",
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-8">
        {/* Logo */}
        <div className="space-y-2">
          <h1 className="text-4xl font-heading font-bold text-gradient">
            TrueKredit
          </h1>
          <p className="text-muted">
            Multi-tenant loan management platform
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="btn-primary"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="btn-secondary"
          >
            Register Tenant
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl">
          <FeatureCard
            title="Loan Management"
            description="Complete loan origination, disbursement, and repayment tracking"
          />
          <FeatureCard
            title="Multi-Tenant"
            description="Secure data isolation with tenant-scoped access control"
          />
          <FeatureCard
            title="Compliance Ready"
            description="Audit logs, Schedule A reports, and data exports"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card text-center">
      <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted text-sm">{description}</p>
    </div>
  );
}
