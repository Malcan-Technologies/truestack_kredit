import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Layers, Linkedin, Mail, Phone } from "lucide-react";
import { LegalNavLink } from "@borrower_pro/components/legal/legal-nav-link";
import {
  proficientFooterLegalLong,
  proficientFooterLegalShort,
} from "@borrower_pro/lib/proficient-site-footer";
import { truestackSiteFooter } from "@borrower_pro/lib/truestack-site-footer";
import { cn } from "@borrower_pro/lib/utils";

type SiteFooterData = typeof truestackSiteFooter;

function isHttpExternalHref(href: string): boolean {
  return /^https?:/i.test(href) || href.startsWith("//");
}

function FooterNavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (/^mailto:/i.test(href) || /^tel:/i.test(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  if (isHttpExternalHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function FootCol({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-4 space-y-3">{children}</ul>
    </div>
  );
}

function MarketingSiteBrandColumn({
  F,
  brandName,
  homeHref,
  brandLogoSrc,
  brandLogoAlt,
}: {
  F: SiteFooterData;
  brandName: string;
  homeHref: string;
  /** When set, shows this image (e.g. from `public/`) instead of the icon + text mark. */
  brandLogoSrc?: string;
  brandLogoAlt?: string;
}) {
  return (
    <div className="max-w-sm space-y-4">
      <FooterNavLink
        href={homeHref}
        className={cn("inline-flex", !brandLogoSrc && "items-center gap-2.5")}
      >
        {brandLogoSrc ? (
          <Image
            src={brandLogoSrc}
            alt={brandLogoAlt ?? brandName}
            width={440}
            height={74}
            className="h-[3.25rem] w-auto max-w-[min(100%,372px)] object-contain object-left sm:h-[3.9rem]"
            sizes="(max-width: 640px) 286px, 372px"
          />
        ) : (
          <>
            <Layers
              className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-500"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              {brandName}
            </span>
          </>
        )}
      </FooterNavLink>
      <p className="text-sm leading-relaxed text-muted-foreground">{F.brand.description}</p>
      <a
        href={F.brand.email}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Mail className="h-4 w-4 shrink-0" aria-hidden />
        {F.brand.emailLabel}
      </a>
      <div>
        <a
          href={F.brand.linkedinHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <Linkedin className="h-4 w-4" aria-hidden />
          LinkedIn
        </a>
      </div>
    </div>
  );
}

function MarketingSiteLinkColumns({ F }: { F: SiteFooterData }) {
  return (
    <>
      {F.kpktSolutions.length > 0 ? (
        <FootCol title="KPKT Solutions">
          {F.kpktSolutions.map((l) => (
            <li key={l.label}>
              <FooterNavLink
                href={l.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </FooterNavLink>
            </li>
          ))}
        </FootCol>
      ) : null}
      <FootCol title="Other Solutions">
        {F.otherSolutions.map((l) => (
          <li key={l.label}>
            <FooterNavLink
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </FooterNavLink>
          </li>
        ))}
      </FootCol>
      {F.company.length > 0 ? (
        <FootCol title="Company">
          {F.company.map((l) => (
            <li key={l.label}>
              <FooterNavLink
                href={l.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </FooterNavLink>
            </li>
          ))}
        </FootCol>
      ) : null}
      <FootCol title="Legal">
        {F.legal.map((l) => (
          <li key={l.label}>
            <FooterNavLink
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </FooterNavLink>
          </li>
        ))}
      </FootCol>
    </>
  );
}

function MarketingSiteBottomBar({ F }: { F: SiteFooterData }) {
  return (
    <div className="mt-14 border-t border-border pt-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p className="text-sm font-semibold tracking-wide text-foreground">{F.companyBar.name}</p>
          <p>{F.companyBar.registration}</p>
          {F.companyBar.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="pt-2 text-muted-foreground/90">{F.companyBar.copyright}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground sm:justify-end">
          {F.bottomLegal.map((l, i) => (
            <span key={l.label} className="inline-flex items-center">
              {i > 0 ? <span className="px-1.5 text-muted-foreground/50">·</span> : null}
              <FooterNavLink
                href={l.href}
                className="transition-colors hover:text-foreground"
              >
                {l.label}
              </FooterNavLink>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TruestackBrandColumn() {
  return (
    <MarketingSiteBrandColumn
      F={truestackSiteFooter}
      brandName="TrueStack"
      homeHref="https://www.truestack.my"
    />
  );
}

function TrueStackLinkColumns() {
  return <MarketingSiteLinkColumns F={truestackSiteFooter} />;
}

function BottomBarTrueStack() {
  return <MarketingSiteBottomBar F={truestackSiteFooter} />;
}

/** TrueStack-style 5-column footer + company bar (matches truestack.my). For Demo Client. */
export function BorrowerDemoTruestackFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          <TruestackBrandColumn />
          <TrueStackLinkColumns />
        </div>
        <BottomBarTrueStack />
      </div>
    </footer>
  );
}

const DEFAULT_PROFICIENT_PLATFORM_LINKS = [
  { label: "Proficient Premium — lending software", href: "https://ppsb-eloan.com.my/" },
  { label: "Contact Proficient", href: "mailto:admin@proficientpremium.com" },
] as const;

type ProficientFooterProps = {
  lenderName: string;
  /** When set, shows this image instead of the text lender name in the first column. */
  brandLogoSrc?: string;
  brandLogoAlt?: string;
  legalName: string;
  email: string;
  phone: string;
  phoneHref: string;
  ssm: string;
  kpktLicense: string;
  addressLines: readonly string[];
  description: string;
  /** Override legal column + bottom bar links (default: Proficient `/terms`, …). */
  legalLong?: ReadonlyArray<{ label: string; href: string }>;
  legalShort?: ReadonlyArray<{ label: string; href: string }>;
  /** Override Platform column (default: Truestack marketing). */
  platformLinks?: ReadonlyArray<{ label: string; href: string }>;
};

/** Same layout as truestack.my; first column and bottom bar are lender-specific; legal links are local. */
export function BorrowerProficientTruestackFooter({
  lenderName,
  brandLogoSrc,
  brandLogoAlt,
  legalName,
  email,
  phone,
  phoneHref,
  ssm,
  kpktLicense,
  addressLines,
  description,
  legalLong,
  legalShort,
  platformLinks,
}: ProficientFooterProps) {
  const legalLongRows = legalLong ?? proficientFooterLegalLong;
  const legalShortRows = legalShort ?? proficientFooterLegalShort;
  const platformRows = platformLinks ?? DEFAULT_PROFICIENT_PLATFORM_LINKS;

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          <div className="max-w-sm space-y-4">
            <Link
              href="/"
              className={
                brandLogoSrc
                  ? "inline-flex"
                  : "font-heading text-lg font-bold tracking-tight text-foreground"
              }
            >
              {brandLogoSrc ? (
                <Image
                  src={brandLogoSrc}
                  alt={brandLogoAlt ?? lenderName}
                  width={320}
                  height={103}
                  className="h-14 w-auto object-contain object-left sm:h-[4.5rem]"
                />
              ) : (
                lenderName
              )}
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              {email}
            </a>
            {phone && phone !== "—" ? (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {phone}
              </a>
            ) : null}
          </div>
          <FootCol title="Explore">
            <li>
              <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                How it works
              </a>
            </li>
            <li>
              <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Features
              </a>
            </li>
            <li>
              <a href="#faq" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                FAQ
              </a>
            </li>
          </FootCol>
          <FootCol title="Account">
            <li>
              <Link href="/sign-in" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Apply
              </Link>
            </li>
          </FootCol>
          <FootCol title="Platform">
            {platformRows.map((row) => (
              <li key={row.label}>
                <FooterNavLink
                  href={row.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {row.label}
                </FooterNavLink>
              </li>
            ))}
          </FootCol>
          <FootCol title="Legal">
            {legalLongRows.map((l) => (
              <li key={l.href}>
                <LegalNavLink
                  href={l.href}
                  backSource="landing"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </LegalNavLink>
              </li>
            ))}
          </FootCol>
        </div>

        <div className="mt-14 border-t border-border pt-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <p className="text-sm font-semibold tracking-wide text-foreground">{legalName.toUpperCase()}</p>
              <p>
                <span className="text-foreground/80">SSM reg. no.</span> {ssm}
              </p>
              <p>
                <span className="text-foreground/80">KPKT licence</span> {kpktLicense}
              </p>
              <div className="pt-0.5">
                <p className="text-foreground/80">Registered address</p>
                {addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <p className="pt-2 text-muted-foreground/90">
                © {new Date().getFullYear()} {lenderName}. All rights reserved.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground sm:justify-end">
              {legalShortRows.map((l, i) => (
                <span key={l.href} className="inline-flex items-center">
                  {i > 0 ? <span className="px-1.5 text-muted-foreground/50">·</span> : null}
                  <LegalNavLink
                    href={l.href}
                    backSource="landing"
                    className="transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </LegalNavLink>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
