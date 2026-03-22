import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "Reports - TrueKredit",
  description: "Analytics and business reports",
};

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestrictedAccessControl>{children}</RestrictedAccessControl>;
}
