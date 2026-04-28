import type { Metadata } from "next";
import { Inter, Rethink_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@borrower_pro/components/theme-provider";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3008";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Pinjocep | KPKT digital lending",
    template: "%s | Pinjocep",
  },
  description:
    "Pinjocep: borrower and lender tooling for Malaysian licensed money lenders and KPKT digital lending licence journeys.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${rethinkSans.variable} font-body antialiased`}
      >
        <ThemeProvider defaultTheme="light" storageKey="pinjocep-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
