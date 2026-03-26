import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register Tenant - TrueKredit",
  description: "Create a new tenant account for TrueKredit",
  alternates: {
    canonical: "/register",
  },
  openGraph: {
    title: "Register Tenant - TrueKredit",
    description: "Create a new tenant account for TrueKredit",
    url: "/register",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Register Tenant - TrueKredit",
    description: "Create a new tenant account for TrueKredit",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
