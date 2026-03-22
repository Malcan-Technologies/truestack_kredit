import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In - TrueKredit",
  description: "Sign in to TrueKredit",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Sign In - TrueKredit",
    description: "Sign in to TrueKredit",
    url: "/login",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign In - TrueKredit",
    description: "Sign in to TrueKredit",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
