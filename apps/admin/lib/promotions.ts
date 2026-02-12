import {
  Mail,
  Fingerprint,
  Gift,
  type LucideIcon,
} from "lucide-react";

// ============================================
// Promotion / Advertisement Data
// ============================================

export interface Promotion {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  badgeVariant: "default" | "success" | "warning" | "destructive" | "info" | "secondary";
  gradient: string;
  borderColor: string;
  href: string;
  features: string[];
  pricing?: string;
  cta: string;
}

export const PROMOTIONS: Promotion[] = [
  {
    id: "automated-emails",
    title: "Automated Emails",
    tagline: "Send receipts, reminders & notices automatically",
    description:
      "Stop manually emailing PDFs. TrueKredit already generates all loan documents — the Automated Emails add-on sends them straight to your borrowers' inbox. Payment receipts, reminder letters, arrears notices, default notices, and discharge letters — all delivered instantly.",
    icon: Mail,
    badge: "Add-on",
    badgeVariant: "info",
    gradient: "from-blue-500/15 via-card to-blue-500/[0.07]",
    borderColor: "border-blue-500/25",
    href: "/dashboard/promotions#automated-emails",
    features: [
      "Payment receipts sent instantly after each repayment",
      "Reminder letters before due dates to reduce late payments",
      "Arrears & default notices delivered automatically",
      "Discharge letters on loan completion",
      "Full audit trail of all email deliveries",
    ],
    pricing: "RM 50/month per 500 active loans",
    cta: "Learn More",
  },
  {
    id: "trueidentity",
    title: "TrueIdentity",
    tagline: "Verify borrower identity digitally via QR code",
    description:
      "TrueIdentity is our integrated e-KYC verification system. Generate a QR code from TrueKredit, let the borrower scan it on their phone to photograph their IC and complete a face liveness check. The system extracts IC data via OCR, cross-checks it against the liveness photo, and saves the result directly into the loan file — all in minutes, from anywhere.",
    icon: Fingerprint,
    badge: "Add-on",
    badgeVariant: "info",
    gradient: "from-emerald-500/15 via-card to-emerald-500/[0.07]",
    borderColor: "border-emerald-500/25",
    href: "/dashboard/promotions#trueidentity",
    features: [
      "QR-based flow — borrowers verify from anywhere, no visit needed",
      "IC (MyKad) photo capture with automatic OCR data extraction",
      "Face liveness check to prevent identity fraud",
      "Results saved to loan file for KPKT audit & compliance",
      "Up to 3 retries per session at no extra cost",
    ],
    pricing: "RM 4 per verification",
    cta: "Learn More",
  },
  {
    id: "refer-and-earn",
    title: "Refer & Earn",
    tagline: "Invite a friend and earn RM499 in cash!",
    description:
      "Know someone who could benefit from TrueKredit? Refer them and once they subscribe, you'll receive RM499 cash — no strings attached. They get a powerful loan management system, you get rewarded.",
    icon: Gift,
    badge: "Coming Soon",
    badgeVariant: "default",
    gradient: "from-primary/15 via-card to-primary/[0.07]",
    borderColor: "border-primary/25",
    href: "/dashboard/profile",
    features: [
      "RM499 cash reward per successful referral",
      "No limit on the number of referrals",
      "Referral tracked automatically",
      "Payout after referee's first billing cycle",
    ],
    cta: "Learn More",
  },
];
