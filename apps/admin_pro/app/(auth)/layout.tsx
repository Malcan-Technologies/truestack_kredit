import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In - TrueKredit",
  description: "Sign in to TrueKredit",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
