import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "Compliance - TrueKredit",
  description: "Schedule A reports, audit logs, and regulatory compliance",
};

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestrictedAccessControl>{children}</RestrictedAccessControl>;
}
