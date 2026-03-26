import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up - TrueKredit",
  description: "Sign up for TrueKredit",
  alternates: {
    canonical: "/signup",
  },
  openGraph: {
    title: "Sign Up - TrueKredit",
    description: "Sign up for TrueKredit",
    url: "/signup",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign Up - TrueKredit",
    description: "Sign up for TrueKredit",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
