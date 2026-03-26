import type { Metadata } from "next";
import Link from "next/link";
import { PoweredByTruestack } from "@/components/powered-by-truestack";

export const metadata: Metadata = {
  title: {
    absolute: "TrueKredit™  - Loan Management Platform",
  },
  description:
    "Multi-tenant KPKT loan management and borrower origination platform for PPW license holders",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TrueKredit™ - Loan Management Platform",
    description:
      "Multi-tenant KPKT loan management and borrower origination platform for PPW license holders",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit™ - Loan Management Platform",
    description:
      "Multi-tenant KPKT loan management and borrower origination platform for PPW license holders",
  },
};

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-8">
        {/* Logo */}
        <div className="space-y-2">
          <h1 className="text-4xl font-heading font-bold text-gradient">
            TrueKredit™ Pro
          </h1>
          <p className="text-muted max-w-xl mx-auto">
            KPKT compliant loan management plus
            dedicated borrower origination portal for applicants and borrowers.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-center">
          <Link href="/login" className="btn-primary">
            Sign In
          </Link>
        </div>

        {/* Powered by Truestack */}
        <div className="flex flex-col items-center gap-4">
          <PoweredByTruestack className="text-center" />
        </div>
      </div>
    </main>
  );
}
