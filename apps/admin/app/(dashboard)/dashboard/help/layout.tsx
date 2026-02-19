import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help - TrueKredit",
  description: "Help and documentation for TrueKredit Admin",
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
