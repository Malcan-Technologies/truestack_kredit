/**
 * Footer legal + platform links for the Pinjocep borrower app (same layout as Proficient Premium,
 * with `/legal/...` routes and Pinjocep marketing URLs in the Platform column).
 */
export const pinjocepBorrowerFooterLegalLong = [
  { label: "Terms of use", href: "/legal/terms" },
  { label: "Privacy policy", href: "/legal/privacy" },
  { label: "PDPA notice", href: "/legal/pdpa" },
  { label: "Cybersecurity", href: "/legal/security" },
] as const;

export const pinjocepBorrowerFooterLegalShort = [
  { label: "Security", href: "/legal/security" },
  { label: "PDPA", href: "/legal/pdpa" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
] as const;

export const pinjocepBorrowerFooterPlatformLinks = [
  { label: "Pinjocep — lending software", href: "https://www.pinjocep.my" },
  { label: "Contact Pinjocep", href: "mailto:hello@pinjocep.my" },
] as const;
