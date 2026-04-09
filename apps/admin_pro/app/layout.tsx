import type { Metadata } from "next";
import { Inter, Rethink_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kredit.truestack.my";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "TrueKredit Pro",
  description:
    "TrueKredit Pro — operations for licensed money lenders in Malaysia: KPKT-aligned lending, origination, e-KYC, notifications, and compliance exports.",
  keywords: [
    "loan management",
    "money lending Malaysia",
    "KPKT",
    "TrueKredit Pro",
    "Malaysia",
    "compliance",
    "loan origination",
    "e-KYC",
    "licensed money lender",
  ],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "TrueKredit Pro",
    description:
      "Lending operations for Malaysian money lenders — physical & digital programmes, origination, and admin controls.",
    url: "/",
    siteName: "TrueKredit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit Pro",
    description:
      "Operations platform for licensed money lenders in Malaysia.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${rethinkSans.variable} font-body antialiased`}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
