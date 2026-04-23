import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Layers, Linkedin, Mail, Phone } from "lucide-react";
import { truestackSiteFooter } from "@borrower_pro/lib/truestack-site-footer";
import { cn } from "@borrower_pro/lib/utils";

const F = truestackSiteFooter;

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

function TruestackBrandColumn() {
  return (
    <div className="max-w-sm space-y-4">
      <a
        href="https://www.truestack.my"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2.5"
      >
        <Layers
          className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-500"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="font-heading text-lg font-bold tracking-tight text-foreground">TrueStack</span>
      </a>
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

function TrueStackLinkColumns() {
  return (
    <>
      <FootCol title="KPKT Solutions">
        {F.kpktSolutions.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </FootCol>
      <FootCol title="Other Solutions">
        {F.otherSolutions.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </FootCol>
      <FootCol title="Company">
        {F.company.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </FootCol>
      <FootCol title="Legal">
        {F.legal.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          </li>
        ))}
      </FootCol>
    </>
  );
}

function BottomBarTrueStack() {
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
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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

const LEGAL_LONG = [
  { label: "Terms of use", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "PDPA notice", href: "/pdpa" },
  { label: "Cybersecurity", href: "/security" },
] as const;

const LEGAL_SHORT = [
  { label: "Security", href: "/security" },
  { label: "PDPA", href: "/pdpa" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
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
}: ProficientFooterProps) {
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
            <a
              href={phoneHref}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              {phone}
            </a>
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
            <li>
              <a
                href="https://www.truestack.my"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Truestack — lending software
              </a>
            </li>
            <li>
              <a
                href="https://www.truestack.my/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Contact Truestack
              </a>
            </li>
          </FootCol>
          <FootCol title="Legal">
            {LEGAL_LONG.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
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
              {LEGAL_SHORT.map((l, i) => (
                <span key={l.href} className="inline-flex items-center">
                  {i > 0 ? <span className="px-1.5 text-muted-foreground/50">·</span> : null}
                  <Link href={l.href} className="transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
