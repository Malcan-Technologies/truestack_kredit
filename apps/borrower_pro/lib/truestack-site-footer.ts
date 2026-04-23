/**
 * Public marketing footer — same structure and links as truestack.my (Truestack corporate).
 * Used by Demo Client borrower homepage footer.
 */
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
} as const;
