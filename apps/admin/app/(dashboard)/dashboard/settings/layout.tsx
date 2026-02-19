import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings - TrueKredit",
  description: "Tenant and account settings",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
