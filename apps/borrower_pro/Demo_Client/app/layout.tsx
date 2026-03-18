import type { Metadata } from "next";
import { Inter, Rethink_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3006";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Demo Client | TrueKredit Pro",
  description: "Digital license KPKT borrowing",
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
        <ThemeProvider defaultTheme="light" storageKey="demo-client-theme">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
