import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile - TrueKredit",
  description: "Your profile and account details",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
