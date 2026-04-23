import type { LucideIcon } from "lucide-react"
import {
  Building2,
  ClipboardList,
  FileStack,
  Fingerprint,
  LayoutDashboard,
  Mail,
  Shield,
  User,
  Users,
  Workflow,
} from "lucide-react"

export type NavLink = {
  label: string
  href: string
}

export const landingNavLinks: NavLink[] = [
  { label: "Platform", href: "#platform" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Operating model", href: "#operating-model" },
  { label: "Borrowers", href: "#borrower-flows" },
  { label: "Integrations", href: "#integrations" },
  { label: "Why TrueKredit", href: "#why-truekredit" },
  { label: "FAQ", href: "#faq" },
]

export const hero = {
  eyebrow: "TrueKredit™ Pro — for licensed money lenders in Malaysia",
  headline: "Operate compliant lending end to end — from origination to servicing",
  subheadline:
    "Run physical and digital KPKT-aligned workflows in one dedicated deployment. Capture applications through your borrower portal, verify identity with TrueIdentity (e-KYC), and keep daily operations, documents, and regulatory exports under control in the admin console.",
  primaryCta: { label: "Book a demo", href: "#book-demo" },
  secondaryCta: { label: "Sign in", href: "/login" },
  heroBadges: [
    "KPKT portal & ledger export ready",
    "Physical & digital lending",
    "Individual & company borrowers",
  ],
} as const

export const trustStripBadges: string[] = [
  "KPKT-ready workflows",
  "Physical + digital lending",
  "Individual + company applications",
  "e-KYC enabled",
  "Notification automation",
  "Malaysia-focused compliance",
]

export type PlatformModule = {
  title: string
  description: string
  icon: LucideIcon
}

export const platformModules: PlatformModule[] = [
  {
    title: "Loan management",
    description:
      "Full lifecycle servicing, schedules, arrears, and document generation — aligned to how licensed lenders operate in Malaysia.",
    icon: ClipboardList,
  },
  {
    title: "Borrower origination portal",
    description:
      "Branded intake for applicants and borrowers so your team captures structured data before it hits underwriting and ops.",
    icon: Users,
  },
  {
    title: "Individual applications",
    description:
      "Flows and data capture tuned for natural persons, with identity verification hooks and consistent handoff to admin review.",
    icon: User,
  },
  {
    title: "Company applications",
    description:
      "Support for corporate borrowers with the extra fields, parties, and operational checks your team expects.",
    icon: Building2,
  },
  {
    title: "TrueIdentity™ e-KYC",
    description:
      "Digital identity checks via the TrueStack public KYC path — built for inspections, auditability, and faster onboarding.",
    icon: Fingerprint,
  },
  {
    title: "TrueSend™ notifications",
    description:
      "Automated email delivery and tracking for receipts, notices, and borrower correspondence — less manual chasing.",
    icon: Mail,
  },
  {
    title: "Document & process workflow",
    description:
      "Generated letters, ledgers, and operational artifacts with clear status — so everyone knows what was issued and when.",
    icon: FileStack,
  },
  {
    title: "Admin operations dashboard",
    description:
      "Portfolio visibility, queues, and controls for staff — without turning day-to-day lending into spreadsheet chaos.",
    icon: LayoutDashboard,
  },
]

export type ProcessStep = {
  step: number
  title: string
  description: string
  icon: LucideIcon
}

export const howItWorksSteps: ProcessStep[] = [
  {
    step: 1,
    title: "Capture application",
    description:
      "Applicants submit through your portal; data lands in structured records ready for review and policy checks.",
    icon: ClipboardList,
  },
  {
    step: 2,
    title: "Verify identity",
    description:
      "Trigger TrueIdentity e-KYC where required. Staff see outcomes and evidence in one place for decisioning and audit.",
    icon: Fingerprint,
  },
  {
    step: 3,
    title: "Review & process",
    description:
      "Your team validates documents, terms, and risk factors using the admin console — with traceability on changes and decisions.",
    icon: Shield,
  },
  {
    step: 4,
    title: "Generate & approve workflow",
    description:
      "Agreements, disclosures, and operational letters flow from the system — with clear approvals before funds move.",
    icon: Workflow,
  },
  {
    step: 5,
    title: "Manage borrower lifecycle",
    description:
      "From disbursement through collections and closure — with exports and reporting that reflect KPKT-facing expectations.",
    icon: Users,
  },
]

export type OperatingModelTab = {
  id: string
  label: string
  title: string
  body: string[]
  bullets: string[]
}

export const operatingModelTabs: OperatingModelTab[] = [
  {
    id: "physical",
    label: "Physical KPKT lending",
    title: "Built for traditional licensed operations",
    body: [
      "TrueKredit Pro supports the day-to-day mechanics of physical KPKT moneylending: structured borrower records, loan books, receipts, arrears, and the operational documents your team issues in the normal course.",
      "Compliance-oriented exports and ledgers (such as iDeal-formatted data and Lampiran A style outputs) help your organisation prepare submissions and maintain defensible records — with audit-logged activity where the product provides it.",
    ],
    bullets: [
      "Year-based and portfolio-aware exports for regulatory preparation",
      "Operational reports for overdue, NPL, and collections performance",
      "Controlled admin roles suitable for supervised lending environments",
    ],
  },
  {
    id: "digital",
    label: "Digital KPKT lending",
    title: "Digital licence readiness without losing operational rigour",
    body: [
      "For lenders pursuing or operating under KPKT digital licensing, Pro pairs a modern borrower-facing experience with the same serious back-office capabilities: origination, servicing, and compliance exports in one deployment.",
      "Digital channels increase volume and speed — Pro is designed so scale doesn’t come at the cost of missing documents, unclear statuses, or unmanaged communications.",
    ],
    bullets: [
      "Borrower portal + e-KYC suitable for remote onboarding at volume",
      "TrueSend automates delivery of key borrower communications",
      "Modular architecture so you can evolve UX without re-platforming",
    ],
  },
]

export type BorrowerFlowTab = {
  id: string
  label: string
  title: string
  intro: string
  points: string[]
}

export const borrowerFlowTabs: BorrowerFlowTab[] = [
  {
    id: "individual",
    label: "Individual borrowers",
    title: "Natural persons: identity-led, high-clarity flow",
    intro:
      "Individual applications emphasise identity validation, affordability-related data capture, and a clean path from application to agreement — with staff controls when you need manual review.",
    points: [
      "Structured intake aligned to personal borrower fields and documentation",
      "TrueIdentity hooks for e-KYC where your policy requires it",
      "Servicing, receipts, and notices stay tied to the same borrower record",
    ],
  },
  {
    id: "company",
    label: "Company borrowers",
    title: "Corporate structures: parties, signatories, and operational checks",
    intro:
      "Company applications add the entities, relationships, and authorisation patterns corporate lending demands — without forcing your team to maintain parallel spreadsheets.",
    points: [
      "Support for company-specific data and operational workflow differences",
      "Clear separation of application vs ongoing servicing data on the same platform",
      "Exports and internal reporting that respect the borrower type in your book",
    ],
  },
]

export const integrationsSection = {
  eyebrow: "Integrated capabilities",
  headline: "TrueIdentity + TrueSend: fewer handoffs, clearer audit trails",
  subhead:
    "These modules are first-class in TrueKredit Pro — not bolt-on scripts. They are designed for Malaysian licensed lending and operational reality.",
  cards: [
    {
      title: "TrueIdentity™ (e-KYC)",
      description:
        "Run verification flows that fit regulatory scrutiny: evidence, outcomes, and workflow integration for staff — aligned with TrueStack’s public KYC model for Pro deployments.",
      points: [
        "Supports digital onboarding at scale",
        "Reduces manual document chasing before approval",
        "Keeps verification context near the loan and borrower record",
      ],
    },
    {
      title: "TrueSend™ (email & notifications)",
      description:
        "Automate delivery of borrower-facing communications when events occur — receipts, reminders, formal notices, and more — with delivery tracking suitable for operations and compliance culture.",
      points: [
        "Branded, consistent correspondence",
        "Less time downloading PDFs and forwarding manually",
        "Traceable delivery status for operational follow-up",
      ],
    },
  ],
} as const

export type WhyPoint = {
  title: string
  description: string
}

export const whyTrueKreditPoints: WhyPoint[] = [
  {
    title: "KPKT-oriented operations",
    description:
      "Workflows and exports reflect how Malaysian moneylenders actually report and evidence lending activity — not a generic loan app template.",
  },
  {
    title: "Dedicated Pro deployment",
    description:
      "One logical lender organisation per environment: isolated operations and data boundaries that match how Pro clients buy and run the product.",
  },
  {
    title: "Physical and digital in one platform",
    description:
      "Whether you are primarily physical today or transitioning to a digital licence, you run the same core system — fewer parallel tools.",
  },
  {
    title: "Modular, maintainable stack",
    description:
      "TrueKredit Pro is built as a modern web application: easier to extend, theme, and integrate as your programme matures.",
  },
  {
    title: "Operational efficiency",
    description:
      "Automation where it matters (notifications, document generation, structured data) so staff focus on credit judgment and borrower outcomes.",
  },
  {
    title: "Credibility with regulators and boards",
    description:
      "Clear records, export discipline, and professional borrower communications support the story you tell to supervisors and stakeholders.",
  },
]

export type FaqItem = {
  question: string
  answer: string
}

export const faqItems: FaqItem[] = [
  {
    question: "Does TrueKredit Pro support both physical and digital KPKT lending?",
    answer:
      "Yes. The platform is designed for licensed moneylending operations in Malaysia across physical and digital KPKT contexts — with the same core origination, servicing, compliance exports, and operational modules.",
  },
  {
    question: "How do individual and company borrowers differ in the system?",
    answer:
      "Both are supported in one platform. Individual flows emphasise personal identity and personal documentation; company flows accommodate corporate data, parties, and operational handling your team uses for non-natural borrowers.",
  },
  {
    question: "How does e-KYC (TrueIdentity) work on Pro?",
    answer:
      "Pro aligns with TrueStack’s public KYC integration model — verification is wired into origination and review workflows so staff see outcomes alongside the application, suitable for audit and supervisory expectations.",
  },
  {
    question: "What happens with borrower emails and notifications?",
    answer:
      "TrueSend automates delivery of many borrower communications (such as receipts and formal notices) when those features are enabled, with tracking so operations can confirm delivery and follow up when needed.",
  },
  {
    question: "Can we customise onboarding and branding?",
    answer:
      "Pro is deployed per client with borrower-facing experiences and administrative controls appropriate to your programme. Specific branding, fields, and rollout phases are typically agreed as part of implementation — ask during a demo for what fits your licence and policy.",
  },
  {
    question: "Is the product “compliance certified”?",
    answer:
      "TrueKredit Pro provides workflow, documentation, and export capabilities oriented to Malaysian moneylending and KPKT-facing processes. Your licence holder remains responsible for legal and regulatory compliance; we focus on building tooling that supports defensible operations and reporting.",
  },
]

export const finalCta = {
  headline: "See TrueKredit Pro with your workflows in mind",
  subhead:
    "Speak with our team about physical vs digital programmes, e-KYC, notifications, and how Pro fits your organisation.",
  bookDemo: { label: "Book a demo", href: "#book-demo" },
  contactSales: { label: "Contact sales", href: "#contact-sales" },
  signIn: { label: "Sign in", href: "/login" },
} as const

export const bookDemoSection = {
  id: "book-demo",
  title: "Book a demo",
  description:
    "Tell us how you lend today and what you are preparing for next (physical, digital, or both). We will walk through admin, borrower flows, and compliance exports.",
  note: "This form is a demo placeholder — wire to your CRM or email endpoint when ready.",
} as const

export const contactSalesSection = {
  id: "contact-sales",
  title: "Contact sales",
  description:
    "For pricing, implementation timelines, and technical questions, reach out through the channels your team uses — or leave a message below.",
  emailLabel: "Work email (optional)",
  companyLabel: "Organisation",
  messageLabel: "How can we help?",
  submitLabel: "Send message",
  note: "Placeholder form — connect to your backend or mail provider for production.",
} as const

export const footer = {
  product: [
    { label: "Platform overview", href: "#platform" },
    { label: "How it works", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
  ],
  company: [
    { label: "Truestack", href: "https://www.truestack.my/about" },
    { label: "Truestack.my", href: "https://truestack.my" },
  ],
  legal: [
    { label: "Privacy", href: "https://truestack.my" },
    { label: "Terms", href: "https://truestack.my" },
  ],
  contactLine: "Malaysia · Licensed lender programmes",
} as const

/** Public marketing footer — column links and company bar aligned with truestack.my. */
export const truestackSiteFooter = {
  brand: {
    description:
      "KPKT compliance services and fintech software development for licensed money lenders in Malaysia.",
    email: "mailto:hello@truestack.my",
    emailLabel: "hello@truestack.my",
    linkedinHref: "https://www.linkedin.com/company/truestack-technologies",
  },
  kpktSolutions: [
    { label: "TrueKredit™", href: "https://www.truestack.my/#truekredit" },
    { label: "Digital KPKT License", href: "https://www.truestack.my/services" },
    { label: "KPKT Account Management", href: "https://www.truestack.my/services" },
  ],
  otherSolutions: [
    { label: "TrueIdentity™", href: "https://www.truestack.my/#trueidentity" },
    { label: "P2P Platforms", href: "https://www.truestack.my/" },
    { label: "Custom Fintech Solutions", href: "https://www.truestack.my/services" },
  ],
  company: [
    { label: "About", href: "https://www.truestack.my/about" },
    { label: "Work", href: "https://www.truestack.my/services" },
    { label: "Careers", href: "https://www.truestack.my/contact" },
    { label: "Contact", href: "https://www.truestack.my/contact" },
  ],
  legal: [
    { label: "Cybersecurity Policy", href: "https://www.truestack.my/cybersecurity" },
    { label: "PDPA Notice", href: "https://www.truestack.my/pdpa" },
    { label: "Privacy Policy", href: "https://www.truestack.my/privacy" },
    { label: "Terms of Use", href: "https://www.truestack.my/terms" },
  ],
  bottomLegal: [
    { label: "Security", href: "https://www.truestack.my/cybersecurity" },
    { label: "PDPA", href: "https://www.truestack.my/pdpa" },
    { label: "Privacy", href: "https://www.truestack.my/privacy" },
    { label: "Terms", href: "https://www.truestack.my/terms" },
  ],
  companyBar: {
    name: "TRUESTACK TECHNOLOGIES SDN. BHD.",
    registration: "Registration No. 202501058714 (1660120-X)",
    addressLines: ["Lot C-13-3, KL Trillion", "No 338 Jalan Tun Razak", "50400 Kuala Lumpur"],
    copyright: "© 2026 TrueStack. All rights reserved.",
  },
} as const
