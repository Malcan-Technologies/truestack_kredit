import type { Metadata } from "next";
import { RestrictedAccessControl } from "@/components/restricted-access-control";

export const metadata: Metadata = {
  title: "Admin Logs - TrueKredit",
  description: "Audit log of admin actions",
};

export default function AdminLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestrictedAccessControl>{children}</RestrictedAccessControl>;
}
