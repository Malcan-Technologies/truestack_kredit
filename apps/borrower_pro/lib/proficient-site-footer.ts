/**
 * Footer legal links for the Proficient-style borrower footer (`BorrowerProficientTruestackFooter`).
 * Paths are app-relative to the borrower app (`/terms`, …), not full site URLs.
 */
export const proficientFooterLegalLong = [
  { label: "Terms of use", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "PDPA notice", href: "/pdpa" },
  { label: "Cybersecurity", href: "/security" },
] as const;

export const proficientFooterLegalShort = [
  { label: "Security", href: "/security" },
  { label: "PDPA", href: "/pdpa" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;
