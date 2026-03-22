import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password - TrueKredit",
  description: "Reset your TrueKredit password",
  alternates: {
    canonical: "/forgot-password",
  },
  openGraph: {
    title: "Reset Password - TrueKredit",
    description: "Reset your TrueKredit password",
    url: "/forgot-password",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Reset Password - TrueKredit",
    description: "Reset your TrueKredit password",
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
