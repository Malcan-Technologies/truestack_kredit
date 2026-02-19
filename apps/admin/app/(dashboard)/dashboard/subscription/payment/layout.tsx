import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment - TrueKredit",
  description: "Complete your subscription payment",
};

export default function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
