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

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Proficient Premium | Borrower Portal",
    template: "%s | Proficient Premium",
  },
  description:
    "Proficient Premium borrower portal: apply for, manage, and repay your loan online.",
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
        <ThemeProvider defaultTheme="light" storageKey="proficient-premium-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
