import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing - TrueKredit",
  description: "Manage invoices and billing",
};

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
