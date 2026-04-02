import { Gift, FileText, ShieldCheck, Store, type LucideIcon } from "lucide-react";

export interface Promotion {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  /** Optional illustration path; when set, used instead of icon */
  illustration?: string;
  badge: string;
  badgeVariant: "default" | "success" | "warning" | "destructive" | "info" | "secondary";
  gradient: string;
  borderColor: string;
  href: string;
  features: string[];
  pricing?: string;
  cta: string;
  /** Optional custom footer text; when omitted, a default is derived from badge/href */
  footerText?: string;
  /** When set, promotions page uses this for CTA (link + "Contact" label) instead of href/cta */
  contactHref?: string;
}

export const PROMOTIONS: Promotion[] = [
  {
    id: "refer-and-earn",
    title: "Refer & Earn",
    tagline: "Invite a friend and earn RM499 in cash!",
    description:
      "Know someone who could benefit from TrueKredit? Refer them and once they subscribe, you'll receive RM499 cash — no strings attached. They get a powerful loan management system, you get rewarded.",
    icon: Gift,
    illustration: "/illustrations/undraw_happy-birthday_lmk0.svg",
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
    cta: "Start Referring",
    footerText: "Get started and share your referral link.",
  },
];

// ============================================
// KPKT Services & Digital License Promotions
// ============================================

export const KPKT_PROMOTIONS: Promotion[] = [
  {
    id: "kpkt-services",
    title: "KPKT Services",
    tagline: "Administrative and compliance services to handle your regulatory needs.",
    description:
      "We handle administrative and compliance items on your behalf so you can focus on your lending business. From company updates and license renewals to annual submissions and PDPA licensing — we process everything on time, every time.",
    icon: FileText,
    illustration: "/illustrations/undraw_documents_9rcz.svg",
    badge: "Available",
    badgeVariant: "success",
    gradient: "from-foreground/[0.12] via-card to-foreground/[0.09] dark:from-black/[0.15] dark:via-card dark:to-black/[0.08]",
    borderColor: "border-foreground/[0.08] dark:border-white/[0.08]",
    href: "/dashboard/promotions#kpkt-services",
    contactHref: "/dashboard/contact",
    features: [
      "Company Updates — Director changes, shareholder updates, and essential company modifications",
      "License Renewals — KPKT license and advertisement permit renewals processed on time",
      "Annual Submissions — B and B1 loan transaction submissions filed to meet regulatory deadlines",
      "PDPA Licensing — Personal Data Protection Act license applications and renewals managed with full compliance",
      "Enterprise Upgrade — Smooth transition to Sdn. Bhd. status with complete documentation and regulatory coordination",
      "Express Handling — Urgent requests prioritized and expedited when you need fast turnaround",
    ],
    cta: "Learn More",
    footerText: "Contact us to learn more about our admin and compliance services.",
  },
  {
    id: "kpkt-digital-license",
    title: "KPKT Digital License Application",
    tagline: "Go from offline operations to a fully digital, KPKT-licensed platform.",
    description:
      "Transform your lending business with our proven process. Operate nationwide, serve customers across all of Malaysia. Web and mobile apps let customers apply and manage loans from anywhere, anytime. Get operational in ~3 months. Built to meet all KPKT digital licensing requirements from day one.",
    icon: ShieldCheck,
    illustration: "/illustrations/undraw_emails_085h.svg",
    badge: "Available",
    badgeVariant: "success",
    gradient: "from-foreground/[0.12] via-card to-foreground/[0.09] dark:from-black/[0.15] dark:via-card dark:to-black/[0.08]",
    borderColor: "border-foreground/[0.08] dark:border-white/[0.08]",
    href: "/dashboard/promotions#kpkt-digital-license",
    contactHref: "/dashboard/contact",
    features: [
      "Operate nationwide across Malaysia",
      "Web + mobile apps for customers",
      "~3 months to launch",
      "Fully compliant with KPKT digital licensing requirements",
    ],
    cta: "Learn More",
    footerText: "Contact us to learn more about digital licensing.",
  },
  {
    id: "debt-marketplace",
    title: "Debt Marketplace",
    tagline: "Buy and sell debt portfolios with other licensed lenders.",
    description:
      "List loans for sale — for cashflow, portfolio rebalancing, or risk management — or acquire debt portfolios at a discount. Peer-to-peer trading, compliant and secure — built for KPKT-licensed lenders.",
    icon: Store,
    illustration: "/illustrations/undraw_empty-cart_574u.svg",
    badge: "Coming Soon",
    badgeVariant: "secondary",
    gradient: "from-foreground/[0.12] via-card to-foreground/[0.09] dark:from-black/[0.15] dark:via-card dark:to-black/[0.08]",
    borderColor: "border-foreground/[0.08] dark:border-white/[0.08]",
    href: "/dashboard/debt-marketplace",
    features: [
      "Sell debt — List any loans for sale (e.g. for cashflow)",
      "Buy debt — Acquire portfolios at a discount",
      "Peer-to-peer trading with other licensed lenders",
      "Compliant & secure — full audit trail and data protection",
      "Streamlined workflow — list, browse, negotiate, settle in TrueKredit",
    ],
    cta: "Learn More",
    footerText: "We'll notify you when the Debt Marketplace is ready.",
  },
];
