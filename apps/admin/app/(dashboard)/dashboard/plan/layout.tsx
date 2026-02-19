import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan - TrueKredit",
  description: "View and manage your subscription plan",
};

export default function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
