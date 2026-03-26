import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - TrueKredit",
  description: "Overview of your loan portfolio, performance metrics, and key insights",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
