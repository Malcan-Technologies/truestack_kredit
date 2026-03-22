import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Promotions - TrueKredit",
  description: "Manage promotional codes and offers",
};

export default function PromotionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
