/**
 * Footer legal + platform links for the DanaKredit borrower app (same layout as Pinjocep,
 * with `/legal/...` routes and DanaKredit URLs in the Platform column).
 */
export const danacreditBorrowerFooterLegalLong = [
  { label: "Terms of use", href: "/legal/terms" },
  { label: "Privacy policy", href: "/legal/privacy" },
  { label: "PDPA notice", href: "/legal/pdpa" },
  { label: "Cybersecurity", href: "/legal/security" },
] as const;

export const danacreditBorrowerFooterLegalShort = [
  { label: "Security", href: "/legal/security" },
  { label: "PDPA", href: "/legal/pdpa" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
] as const;

export const danacreditBorrowerFooterPlatformLinks = [
  { label: "DanaKredit — borrower portal", href: "https://www.danakredit.my" },
  { label: "Contact DanaKredit", href: "mailto:hello@danakredit.my" },
] as const;
