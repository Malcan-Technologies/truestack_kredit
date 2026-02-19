import { Gift, type LucideIcon } from "lucide-react";

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
    id: "refer-and-earn",
    title: "Refer & Earn",
    tagline: "Invite a friend and earn RM499 in cash!",
    description:
      "Know someone who could benefit from TrueKredit? Refer them and once they subscribe, you'll receive RM499 cash — no strings attached. They get a powerful loan management system, you get rewarded.",
    icon: Gift,
    badge: "Available",
    badgeVariant: "success",
    gradient: "from-foreground/[0.12] via-card to-foreground/[0.09] dark:from-black/[0.15] dark:via-card dark:to-black/[0.08]",
    borderColor: "border-foreground/[0.08] dark:border-white/[0.08]",
    href: "/dashboard/profile",
    features: [
      "RM499 cash reward per successful referral",
      "No limit on the number of referrals",
      "Referral tracked automatically",
      "Payout after referee's first billing cycle",
    ],
    cta: "View in Profile",
  },
];
