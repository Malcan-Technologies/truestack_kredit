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

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "DanaKredit | Borrower portal",
    template: "%s | DanaKredit",
  },
  description:
    "DanaKredit borrower portal: apply for, manage, and repay your loan online. Licensed money lender services in Malaysia.",
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
        <ThemeProvider defaultTheme="light" storageKey="danacredit-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
