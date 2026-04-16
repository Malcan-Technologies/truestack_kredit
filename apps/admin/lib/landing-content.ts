import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  FileStack,
  Fingerprint,
  Layers,
  Mail,
  Shield,
  User,
  Users,
  Workflow,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
};

export const landingNavLinks: NavLink[] = [
  { label: "Platform", href: "#platform" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Plans", href: "#plans" },
  { label: "Borrowers", href: "#borrower-flows" },
  { label: "Modules", href: "#integrations" },
  { label: "Why TrueKredit", href: "#why-truekredit" },
  { label: "FAQ", href: "#faq" },
];

export const hero = {
  eyebrow: "TrueKredit™ Core — subscription operations for licensed money lenders",
  headline: "Run KPKT-aligned lending on a plan that fits your team — without online self-serve loans",
  subheadline:
    "Core is the multi-tenant admin platform for Malaysian PPW/PPG-style operations: staff capture applications in-branch or in the console, move work through structured review, service loans, and produce compliance-oriented exports. Borrowers do not complete end-to-end “online loans” on Core; origination stays under your staff’s control.",
  primaryCta: { label: "Get started", href: "/register" },
  secondaryCta: { label: "Sign in", href: "/login" },
  heroBadges: [
    "KPKT-oriented workflows",
    "Subscription by plan",
    "Staff-led origination",
    "Multi-tenant & RBAC",
  ],
} as const;

export const trustStripBadges: string[] = [
  "Jadual J / K aware operations",
  "L1 / L2 application review",
  "Plans, billing & add-ons",
  "In-branch & admin capture",
  "Individual + company borrowers",
  "Audit logs & exports",
  "TrueIdentity & TrueSend modules",
];

export type PlatformModule = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const platformModules: PlatformModule[] = [
  {
    title: "Loan management",
    description:
      "Servicing, schedules, arrears, disbursement, and lifecycle tooling aligned to how licensed lenders operate in Malaysia.",
    icon: ClipboardList,
  },
  {
    title: "Staff-led applications",
    description:
      "Applications are created and progressed by your team in the admin console — not through a borrower self-serve online loan funnel.",
    icon: Shield,
  },
  {
    title: "Individual borrowers",
    description:
      "Natural-person records, documents, and workflows tuned for PPW-style personal lending with clear handoff to review.",
    icon: User,
  },
  {
    title: "Company borrowers",
    description:
      "Corporate borrowers with the extra fields and checks your ops team expects, without parallel spreadsheets.",
    icon: Building2,
  },
  {
    title: "TrueIdentity™ (module)",
    description:
      "Optional e-KYC path where your policy calls for it — verification context stays next to the borrower and application record.",
    icon: Fingerprint,
  },
  {
    title: "TrueSend™ (module)",
    description:
      "Optional automated email for receipts, notices, and operational correspondence when you enable it on your plan.",
    icon: Mail,
  },
  {
    title: "Documents & compliance exports",
    description:
      "Generated artifacts, ledgers, and exports oriented to KPKT-facing preparation — with activity logging where the product provides it.",
    icon: FileStack,
  },
  {
    title: "Plans, billing & tenant admin",
    description:
      "Subscribe to Core, manage billing, and administer your organisation with role-based access for owners, admins, and staff.",
    icon: Layers,
  },
];

export type ProcessStep = {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const howItWorksSteps: ProcessStep[] = [
  {
    step: 1,
    title: "Capture the application",
    description:
      "Staff record the application in the console (including in-branch scenarios). Structured data is ready for policy and review queues.",
    icon: ClipboardList,
  },
  {
    step: 2,
    title: "Verify when required",
    description:
      "Use TrueIdentity or your existing checks where appropriate. Outcomes sit with the application for L1/L2 decisions and audit.",
    icon: Fingerprint,
  },
  {
    step: 3,
    title: "Review in stages",
    description:
      "Core supports staged review (e.g. L1 then L2) so first-line and final credit discipline map to how your committee works.",
    icon: Shield,
  },
  {
    step: 4,
    title: "Approve, document, disburse",
    description:
      "Final approval creates the loan book entry and schedule; operational documents and disbursement flows follow your process.",
    icon: Workflow,
  },
  {
    step: 5,
    title: "Service to closure",
    description:
      "Collections, arrears, completion, and exports stay on one tenant record — with plan-gated features as you grow.",
    icon: Users,
  },
];

export type OperatingModelTab = {
  id: string;
  label: string;
  title: string;
  body: string[];
  bullets: string[];
};

/** “Plans” section: subscription positioning vs staff-led operating model */
export const operatingModelTabs: OperatingModelTab[] = [
  {
    id: "plans",
    label: "Plans & subscription",
    title: "Core is packaged for teams that want clear scope and billing",
    body: [
      "TrueKredit Core is offered as a subscription: your tenant, your users, and plan-gated capabilities (including optional modules like TrueIdentity and TrueSend). Upgrade paths and add-ons are designed so you can grow without re-platforming.",
      "Onboarding, billing, and plan management live in the same admin experience as lending — so finance and operations see one system, not a separate “portal sprawl.”",
    ],
    bullets: [
      "Tenant isolation with role-based access control",
      "Billing, subscription status, and plan pages in-product",
      "Module add-ons when your programme is ready",
    ],
  },
  {
    id: "staff-led",
    label: "Staff-led origination",
    title: "No online self-serve loan pipeline on Core",
    body: [
      "Core does not position a borrower-facing, end-to-end “apply for a loan online” product. Origination is led by your licensed staff: in-branch interviews, phone-led intake, or data entry in the admin console — keeping control with the licence holder.",
      "That model matches many PPW/PPG operations today and reduces the compliance surface of unsolicited digital origination while still giving you modern tooling for everything after capture.",
    ],
    bullets: [
      "Applications created and submitted from the admin side",
      "Borrower portal / online loan journey is not part of Core’s story",
      "TrueKredit Pro remains the path for full digital + portal programmes",
    ],
  },
];

export type BorrowerFlowTab = {
  id: string;
  label: string;
  title: string;
  intro: string;
  points: string[];
};

export const borrowerFlowTabs: BorrowerFlowTab[] = [
  {
    id: "individual",
    label: "Individual borrowers",
    title: "Personal borrowers: staff-captured, inspection-friendly",
    intro:
      "Individual lending on Core emphasises clean records, document discipline, and identity checks where your policy requires them — all recorded by your team rather than a self-serve online funnel.",
    points: [
      "Structured fields aligned to personal moneylending operations",
      "Verification hooks (e.g. TrueIdentity) when you enable them",
      "Servicing and notices tied to the same borrower record",
    ],
  },
  {
    id: "company",
    label: "Company borrowers",
    title: "Corporate borrowers: entities, parties, operational rigour",
    intro:
      "Company borrowers get the entity-centric data model your ops team needs — still under staff-led capture and review, consistent with Core’s control model.",
    points: [
      "Corporate-specific data without duplicating systems",
      "Same tenant for application history and ongoing servicing",
      "Exports and internal views respect borrower type",
    ],
  },
];

export const integrationsSection = {
  eyebrow: "Optional modules",
  headline: "TrueIdentity + TrueSend when your plan includes them",
  subhead:
    "On Core, powerful capabilities are available as modules you can turn on as your subscription and policy mature — integrated in the same stack, not ad hoc tools.",
  cards: [
    {
      title: "TrueIdentity™ (e-KYC)",
      description:
        "Add digital verification where it fits your SOP. Evidence and outcomes stay adjacent to applications for reviewers and auditors.",
      points: [
        "Supports staff-triggered verification flows",
        "Reduces manual chasing before approval",
        "Keeps context on the borrower record",
      ],
    },
    {
      title: "TrueSend™ (email & notifications)",
      description:
        "When enabled, automate borrower-facing emails for operational events — with delivery visibility your team can rely on.",
      points: [
        "Consistent, professional correspondence",
        "Less manual forwarding of PDFs",
        "Traceable delivery for follow-up",
      ],
    },
  ],
} as const;

export type WhyPoint = {
  title: string;
  description: string;
};

export const whySectionHeader = {
  title: "Why TrueKredit Core for your organisation",
  description:
    "When you need modern loan operations, tenant isolation, and plan-based delivery — without committing to a full digital borrower origination programme.",
};

export const whyTrueKreditPoints: WhyPoint[] = [
  {
    title: "KPKT-oriented, not generic “fintech”",
    description:
      "Workflows and exports reflect Malaysian moneylending practice — Jadual J/K awareness, review queues, and supervision-ready records.",
  },
  {
    title: "Subscription clarity",
    description:
      "Core is built around plans and billing you can explain to finance: what’s included, what’s an add-on, and how users are entitled.",
  },
  {
    title: "Staff-controlled origination",
    description:
      "If unsolicited online lending isn’t your model, Core keeps origination under licence-holder staff while still digitising the back office.",
  },
  {
    title: "Multi-tenant RBAC",
    description:
      "Tenant-scoped data, catalogued roles, and permission gates so larger teams can operate without sharing one blunt “admin password.”",
  },
  {
    title: "Grow toward Pro when you’re ready",
    description:
      "Core and Pro share DNA. When you need borrower portal, digital programme breadth, and deeper automation, TrueKredit Pro is the upgrade path.",
  },
  {
    title: "Operational credibility",
    description:
      "Professional admin UX, audit logging where provided, and disciplined exports support the story you tell boards and supervisors.",
  },
];

export type FaqItem = {
  question: string;
  answer: string;
};

export const faqSectionHeader = {
  title: "Questions teams ask about Core",
  description:
    "Plans, origination model, modules, and how Core differs from TrueKredit Pro.",
};

export const faqItems: FaqItem[] = [
  {
    question: "Does Core include online loans or a borrower self-serve application journey?",
    answer:
      "No. TrueKredit Core is positioned for staff-led origination: your team captures and submits applications in the admin experience (including in-branch workflows). There is no end-to-end online loan product for unsolicited borrower self-serve on Core. For digital origination and borrower portal programmes, evaluate TrueKredit Pro.",
  },
  {
    question: "How does pricing work?",
    answer:
      "Core is subscription-based with plan-gated features and optional module add-ons (such as TrueIdentity and TrueSend). Specific tiers, limits, and commercial terms are managed through your Truestack relationship — use Get started or Contact sales to align with your licence holder entity.",
  },
  {
    question: "What is the difference between Core and Pro?",
    answer:
      "Core focuses on multi-tenant admin operations, staff-led applications, servicing, compliance-oriented exports, and plan-based delivery. Pro adds the broader digital lending and borrower-portal operating model, plus additional operational surfaces aimed at full digital KPKT programmes.",
  },
  {
    question: "Do you support both individual and company borrowers?",
    answer:
      "Yes. Both borrower types are supported in one tenant with workflows appropriate to natural persons vs corporate structures.",
  },
  {
    question: "How do TrueIdentity and TrueSend work on Core?",
    answer:
      "They are optional modules you enable according to your plan and policy. They integrate with applications, borrowers, and operations rather than living as disconnected tools.",
  },
  {
    question: 'Is the product "compliance certified"?',
    answer:
      "TrueKredit provides capabilities oriented to Malaysian moneylending and KPKT-facing processes. Your licence holder remains responsible for legal and regulatory compliance; we focus on tooling that supports defensible operations and reporting.",
  },
];

export const finalCta = {
  headline: "Start with TrueKredit Core on your plan",
  subhead:
    "Create a tenant, invite your team, and run staff-led lending with the modules you need — or talk to us about scope, security review, and rollout.",
  bookDemo: { label: "Get started", href: "/register" },
  contactSales: { label: "Contact sales", href: "#contact-sales" },
  signIn: { label: "Sign in", href: "/login" },
} as const;

export const bookDemoSection = {
  id: "book-demo",
  title: "Request a walkthrough",
  description:
    "Share your licence type, team size, and whether you are PPW- or PPG-focused. We will map Core plans, modules, and implementation expectations.",
  note: "This form is a placeholder — connect to your CRM or email endpoint when ready.",
} as const;

export const contactSalesSection = {
  id: "contact-sales",
  title: "Contact sales",
  description:
    "For commercial terms, security questionnaires, and integration questions, reach out through the channels your team uses — or leave a message below.",
  emailLabel: "Work email (optional)",
  companyLabel: "Organisation",
  messageLabel: "How can we help?",
  submitLabel: "Send message",
  note: "Placeholder form — connect to your backend or mail provider for production.",
} as const;

export const footer = {
  product: [
    { label: "Platform overview", href: "#platform" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Plans", href: "#plans" },
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
  contactLine: "Malaysia · Licensed moneylending programmes",
} as const;
