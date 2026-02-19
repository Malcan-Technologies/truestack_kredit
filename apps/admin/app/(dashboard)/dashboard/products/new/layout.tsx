import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Product - TrueKredit",
  description: "Create a new loan product",
};

export default function NewProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
