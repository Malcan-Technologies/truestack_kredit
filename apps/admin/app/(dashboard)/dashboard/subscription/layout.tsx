import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription - TrueKredit",
  description: "Manage your TrueKredit subscription",
};

export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
