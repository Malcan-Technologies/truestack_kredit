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
  title: "TrueKredit",
  description: "Multi-tenant loan management platform for lenders",
  keywords: [
    "loan management",
    "lending platform",
    "multi-tenant",
    "Malaysia",
    "compliance",
    "Schedule A",
    "loan origination",
  ],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "TrueKredit",
    description: "Multi-tenant loan management platform for lenders",
    url: "/",
    siteName: "TrueKredit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueKredit",
    description: "Multi-tenant loan management platform for lenders",
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
