import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Borrower - TrueKredit",
  description: "Add a new borrower to your tenant",
};

export default function NewBorrowerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
