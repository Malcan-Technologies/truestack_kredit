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
    gradient: "from-blue-500/10 via-card to-blue-500/5",
    borderColor: "border-blue-500/20",
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
    id: "ekyc",
    title: "e-KYC Verification",
    tagline: "Verify borrower identity digitally in seconds",
    description:
      "Streamline your onboarding with automated identity verification. The e-KYC add-on lets you verify borrower MyKad and documents digitally — no manual checks required. Reduce fraud risk, speed up approvals, and stay compliant effortlessly.",
    icon: Fingerprint,
    badge: "Coming Soon",
    badgeVariant: "warning",
    gradient: "from-emerald-500/10 via-card to-emerald-500/5",
    borderColor: "border-emerald-500/20",
    href: "/dashboard/promotions#ekyc",
    features: [
      "MyKad verification with liveness detection",
      "Automated document OCR extraction",
      "Real-time identity matching & fraud detection",
      "Compliance-ready audit trail",
      "Seamless integration into loan applications",
    ],
    pricing: "Contact us for pricing",
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
    gradient: "from-primary/10 via-card to-primary/5",
    borderColor: "border-primary/20",
    href: "/dashboard/promotions#refer-and-earn",
    features: [
      "RM499 cash reward per successful referral",
      "No limit on the number of referrals",
      "Referral tracked automatically",
      "Payout after referee's first billing cycle",
    ],
    cta: "Learn More",
  },
];
