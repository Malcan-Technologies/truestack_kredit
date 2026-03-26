import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "Loans - TrueKredit",
  description: "View and manage loan disbursements, repayments, and schedules",
};

export default function LoansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestrictedAccessControl>{children}</RestrictedAccessControl>;
}
