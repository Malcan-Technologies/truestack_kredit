import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Application - TrueKredit",
  description: "Create a new loan application",
};

export default function NewApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
