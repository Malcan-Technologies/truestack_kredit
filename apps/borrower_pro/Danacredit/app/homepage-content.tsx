"use client";

import type { LenderInfo } from "@kredit/borrower";
import Image from "next/image";
import Link from "next/link";
import { LegalNavLink } from "@borrower_pro/components/legal/legal-nav-link";
import { mergeLenderFooterFields } from "@borrower_pro/lib/merge-tenant-lender-display";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BanknoteArrowUp,
  Building2,
  Calculator,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock,
  FileText,
  Lock,
  Pencil,
  ShieldCheck,
  Smartphone,
  User,
  Zap,
} from "lucide-react";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import { Button } from "@borrower_pro/components/ui/button";
import { Badge } from "@borrower_pro/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@borrower_pro/components/ui/card";
import { Input } from "@borrower_pro/components/ui/input";
import { Label } from "@borrower_pro/components/ui/label";
import { Slider } from "@borrower_pro/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@borrower_pro/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@borrower_pro/components/ui/accordion";
import { BorrowerProficientTruestackFooter } from "@borrower_pro/components/borrower-marketing-footer";
import {
  danacreditBorrowerFooterLegalLong,
  danacreditBorrowerFooterLegalShort,
  danacreditBorrowerFooterPlatformLinks,
} from "@borrower_pro/lib/danacredit-borrower-footer-legal";
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";
import {
  fetchBorrowerMe,
  fetchLenderInfo,
  resolveBorrowerLenderLogoSrc,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  fetchPublicProducts,
  type BorrowerProduct,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  calculateFlatInterest,
  cn,
  formatCurrency,
  safeAdd,
  safeDivide,
  safeMultiply,
  safeSubtract,
  toSafeNumber,
} from "@borrower_pro/lib/utils";
import {
  LENDER_ADDRESS_LINES,
  LENDER_EMAIL,
  LENDER_KPKT_LICENSE,
  LENDER_LEGAL_NAME,
  LENDER_NAME,
  LENDER_PHONE,
  LENDER_PHONE_HREF,
  LENDER_SSM,
} from "@/app/components/legal/danacredit-site";

/* ───────────────────── Constants ────────────────────── */
const ANNUAL_INTEREST_RATE = 18;
const AFFORDABILITY_FACTOR = 0.8;
const CALCULATOR_FOOTNOTE =
  "Indicative only—not a loan offer. Final terms are confirmed after assessment and appear in your loan documentation.";
const TERM_MONTHS_OPTIONS = [6, 12, 18, 24] as const;
const MAX_LOAN_ROUND_STEP = 100;

/** Hero copy legibility over photographic skyline */
const HERO_TITLE_SHADOW =
  "[text-shadow:0_2px_6px_rgba(0,0,0,0.55),0_6px_32px_rgba(0,0,0,0.42)]";
const HERO_BODY_SHADOW =
  "[text-shadow:0_1px_3px_rgba(0,0,0,0.58),0_2px_16px_rgba(0,0,0,0.4)]";
const HERO_EDGE_SHADOW =
  "shadow-[0_2px_16px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.28)]";
const HERO_ICON_DROP = "drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]";

function floorToStep(value: number, step: number): number {
  if (value <= 0 || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

function roundToNearestStep(value: number, step: number): number {
  if (value <= 0 || step <= 0) return 0;
  return Math.round(value / step) * step;
}

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Apply Online",
    description:
      "Fill out our simple application form in under 5 minutes. No branch visit needed.",
    Icon: Smartphone,
  },
  {
    step: "02",
    title: "Quick Review",
    description:
      "Our team reviews your application and assesses your eligibility within hours.",
    Icon: Clock,
  },
  {
    step: "03",
    title: "Sign Digitally",
    description:
      "E-sign your loan agreement securely online. No paperwork, no queues.",
    Icon: Pencil,
  },
  {
    step: "04",
    title: "Receive Funds",
    description:
      "Once approved, money is transferred directly to your bank account.",
    Icon: BanknoteArrowUp,
  },
] as const;

const WHY_US = [
  {
    title: "KPKT Licensed",
    description:
      "Fully licensed under the Moneylenders Act 1951. Your trust is protected by regulation.",
    Icon: BadgeCheck,
  },
  {
    title: "Transparent Rates",
    description:
      "Clear interest rates disclosed upfront. No surprises, no hidden calculations.",
    Icon: FileText,
  },
  {
    title: "No Hidden Fees",
    description:
      "Every charge is explained in your agreement. What you see is what you pay.",
    Icon: ShieldCheck,
  },
  {
    title: "24-Hour Approval",
    description:
      "Fast decisions powered by our streamlined review process. Time is money.",
    Icon: Zap,
  },
  {
    title: "Bank-Level Security",
    description:
      "Your data is protected with enterprise-grade encryption and PDPA compliance.",
    Icon: Lock,
  },
  {
    title: "100% Digital",
    description:
      "Apply, sign, and manage your loan entirely online. No branch visits needed.",
    Icon: Smartphone,
  },
] as const;

/* ───────────────────── Sub-components ───────────────── */

function HomeBrandMark({
  tenantLogoSrc,
  lenderName,
  isLoading,
}: {
  tenantLogoSrc?: string;
  lenderName: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Link
        href="/"
        className="flex items-center"
        aria-label={`${lenderName} home`}
      >
        <div className="h-[3.25rem] w-[11rem] animate-pulse rounded-md bg-muted sm:h-[3.575rem]" />
      </Link>
    );
  }

  const src = tenantLogoSrc ?? "/danacredit-logo.png";
  return (
    <Link
      href="/"
      className="flex items-center"
      aria-label={`${lenderName} home`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${lenderName} logo`}
        className="h-[3.25rem] w-auto max-w-[286px] object-contain object-left sm:h-[3.575rem]"
        width={338}
        height={57}
      />
    </Link>
  );
}

function HomeHeaderActions() {
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBorrowerMe()
      .then((res) => {
        if (!cancelled && res.success) setHasValidSession(true);
      })
      .catch(() => {
        if (!cancelled) setHasValidSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="outline" className="hidden sm:inline-flex">
        <Link href={hasValidSession ? "/dashboard" : "/sign-in"}>
          {hasValidSession ? "Dashboard" : "Sign in"}
        </Link>
      </Button>
      <Button asChild>
        <Link href="/sign-up">Get started</Link>
      </Button>
    </div>
  );
}

/* ─── Loan Calculator (unchanged logic) ──────────────── */

function HomeLoanCalculator() {
  const [termIndex, setTermIndex] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState("4500");
  const [currentCommitments, setCurrentCommitments] = useState("1200");
  const [loanAmountPercent, setLoanAmountPercent] = useState(100);

  const result = useMemo(() => {
    const termMonths = TERM_MONTHS_OPTIONS[termIndex] ?? 12;
    const incomeValue = toSafeNumber(monthlyIncome);
    const commitmentsValue = toSafeNumber(currentCommitments);
    const affordabilityCap = safeMultiply(incomeValue, AFFORDABILITY_FACTOR);
    const remainingAfterCommitments = safeSubtract(
      affordabilityCap,
      commitmentsValue,
    );
    const availableMonthlyRepayment =
      remainingAfterCommitments > 0 ? remainingAfterCommitments : 0;
    const canAssess = termMonths > 0 && incomeValue > 0;
    const annualRateDecimal = safeDivide(ANNUAL_INTEREST_RATE, 100, 8);
    const termYears = termMonths > 0 ? safeDivide(termMonths, 12, 8) : 0;
    const repaymentFactor =
      termMonths > 0
        ? safeAdd(1, safeMultiply(annualRateDecimal, termYears, 8))
        : 0;
    const maxLoanRaw =
      canAssess && availableMonthlyRepayment > 0 && repaymentFactor > 0
        ? safeDivide(
            safeMultiply(availableMonthlyRepayment, termMonths, 8),
            repaymentFactor,
          )
        : 0;
    const maxLoanAmount = floorToStep(maxLoanRaw, MAX_LOAN_ROUND_STEP);
    const hasCapacity = canAssess && maxLoanAmount > 0;
    const chosenRaw =
      maxLoanAmount > 0
        ? safeDivide(
            safeMultiply(maxLoanAmount, loanAmountPercent, 8),
            100,
            8,
          )
        : 0;
    const chosenLoanAmount =
      maxLoanAmount > 0
        ? Math.min(
            roundToNearestStep(chosenRaw, MAX_LOAN_ROUND_STEP),
            maxLoanAmount,
          )
        : 0;
    const chosenTotalInterest =
      chosenLoanAmount > 0 && termMonths > 0
        ? calculateFlatInterest(
            chosenLoanAmount,
            ANNUAL_INTEREST_RATE,
            termMonths,
          )
        : 0;
    const chosenTotalRepayable = safeAdd(chosenLoanAmount, chosenTotalInterest);
    const estimatedMonthlyRepayment =
      termMonths > 0 ? safeDivide(chosenTotalRepayable, termMonths) : 0;
    return {
      termMonths,
      incomeValue,
      maxLoanAmount,
      chosenLoanAmount,
      chosenTotalInterest,
      chosenTotalRepayable,
      estimatedMonthlyRepayment,
      remainingAfterCommitments,
      canAssess,
      hasCapacity,
    };
  }, [currentCommitments, loanAmountPercent, monthlyIncome, termIndex]);

  const affordabilityShortfall =
    result.remainingAfterCommitments < 0
      ? safeSubtract(0, result.remainingAfterCommitments)
      : 0;

  return (
    <Card
      id="loan-calculator"
      className="border-border/70 bg-card/95 shadow-lg shadow-primary/5"
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Loan estimate</Badge>
          <Badge variant="outline">{ANNUAL_INTEREST_RATE}% p.a. example</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl sm:text-3xl">
            How much can I borrow?
          </CardTitle>
          <CardDescription className="mt-2">
            Enter your income and commitments to see an indicative monthly
            repayment.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="loan-term-slider">Loan term</Label>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {result.termMonths} months
              </span>
            </div>
            <Slider
              id="loan-term-slider"
              value={[termIndex]}
              onValueChange={(value) => setTermIndex(value[0] ?? 0)}
              min={0}
              max={TERM_MONTHS_OPTIONS.length - 1}
              step={1}
              className="w-full"
              aria-valuetext={`${result.termMonths} months`}
            />
            <div className="flex justify-between px-0.5 text-xs tabular-nums text-muted-foreground">
              {TERM_MONTHS_OPTIONS.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly-income">Monthly income (RM)</Label>
            <Input
              id="monthly-income"
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
              placeholder="4500"
            />
            <p className="text-xs text-muted-foreground">
              Gross income including salary and other sources.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="current-commitments">
                Current monthly commitments (RM)
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="More information about commitments"
                    >
                      <CircleHelp className="h-4 w-4" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Monthly commitments, including EPF contributions, tax, and
                      similar deductions.
                    </p>
                    <p className="mt-1 text-xs opacity-70">
                      Include other loans (house/car) and recurring obligations
                      (rent, utilities).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="current-commitments"
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              value={currentCommitments}
              onChange={(e) => setCurrentCommitments(e.target.value)}
              placeholder="1200"
            />
          </div>

          {!(result.canAssess && result.hasCapacity) && (
            <div
              aria-live="polite"
              className={cn(
                "rounded-xl border p-4",
                result.canAssess
                  ? "border-error/30 bg-error/10"
                  : "border-border/70 bg-secondary/40",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {result.canAssess ? (
                    <CircleAlert className="h-5 w-5 text-error" aria-hidden />
                  ) : (
                    <Calculator
                      className="h-5 w-5 text-foreground"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {!result.canAssess
                      ? "Add net monthly income to see an example."
                      : result.remainingAfterCommitments < 0
                        ? `Commitments exceed affordability by ${formatCurrency(affordabilityShortfall)}`
                        : "No estimate—try a higher income or lower commitments."}
                  </p>
                  {!result.canAssess && (
                    <p className="text-sm text-muted-foreground">
                      This is not a credit decision.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className={cn(
              "space-y-4",
              !result.hasCapacity &&
                "rounded-lg border border-border/60 bg-muted/20 p-4 opacity-60",
            )}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="loan-amount-share-slider">Loan amount</Label>
              <div className="text-right text-sm tabular-nums text-foreground">
                <span className="font-medium">
                  {formatCurrency(result.chosenLoanAmount)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  / {formatCurrency(result.maxLoanAmount)} max
                </span>
              </div>
            </div>
            <Slider
              id="loan-amount-share-slider"
              disabled={!result.hasCapacity}
              value={[loanAmountPercent]}
              onValueChange={(value) => setLoanAmountPercent(value[0] ?? 0)}
              min={0}
              max={100}
              step={1}
              className="w-full"
              aria-valuetext={`${loanAmountPercent}% of maximum`}
            />
            <div className="flex justify-between px-0.5 text-xs text-muted-foreground">
              <span>RM 0</span>
              <span>100% of max</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-success/25 bg-success/10 p-4">
              <p className="text-sm text-muted-foreground">Loan amount</p>
              <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                {formatCurrency(result.chosenLoanAmount)}
              </p>
            </div>
            <div className="rounded-xl border border-success/25 bg-success/10 p-4">
              <p className="text-sm text-muted-foreground">
                Monthly repayment
              </p>
              <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                {formatCurrency(result.estimatedMonthlyRepayment)}
              </p>
            </div>
          </div>

          {result.remainingAfterCommitments < 0 ? (
            <Button type="button" size="lg" className="w-full" disabled>
              Apply now <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-up">
                Apply now <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          )}

          <p className="text-xs leading-6 text-muted-foreground">
            Flat {ANNUAL_INTEREST_RATE}% p.a. over the term.
            {result.hasCapacity && result.chosenLoanAmount > 0 && (
              <>
                {" "}
                Total repayable{" "}
                {formatCurrency(result.chosenTotalRepayable)} (principal +
                interest).{" "}
              </>
            )}
            {CALCULATOR_FOOTNOTE}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Product Cards ──────────────────────────────────── */

function ProductCards({
  products,
  loading,
}: {
  products: BorrowerProduct[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="border-border/70 bg-background">
            <CardHeader>
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="mt-3 h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-16 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-10 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-border/70 bg-background p-8 text-center">
        <p className="text-muted-foreground">
          No loan products are currently available. Please check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {products.map((product) => {
        const maxAmount =
          typeof product.maxAmount === "number"
            ? product.maxAmount
            : Number(product.maxAmount);
        const interestRate =
          typeof product.interestRate === "number"
            ? product.interestRate
            : Number(product.interestRate);
        const docs = product.requiredDocuments ?? [];
        const isCorporate =
          product.eligibleBorrowerTypes?.includes("CORPORATE");
        const Icon = isCorporate ? Building2 : User;
        const typeLabel = isCorporate
          ? "For Business Growth"
          : "For Individual Needs";

        return (
          <Card
            key={product.id}
            className="group overflow-hidden border-border/70 bg-background transition-shadow hover:shadow-lg"
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>
                    {product.description ?? typeLabel}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Max Amount",
                    value:
                      maxAmount > 0
                        ? `RM ${(maxAmount / 1000).toFixed(0)}K`
                        : "—",
                  },
                  {
                    label: "Rate p.a.",
                    value: interestRate > 0 ? `${interestRate}%` : "—",
                  },
                  {
                    label: "Max Term",
                    value:
                      product.maxTerm > 0
                        ? `${product.maxTerm} mo`
                        : "—",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-center"
                  >
                    <p className="font-heading text-lg font-bold text-foreground">
                      {value}
                    </p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {docs.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    Documents Needed
                  </p>
                  <ul className="space-y-1.5">
                    {docs.map((doc) => (
                      <li
                        key={doc.key}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-success"
                          aria-hidden
                        />
                        {doc.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button asChild className="w-full">
                <Link href="/sign-up">Apply for {product.name}</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */

export function HomePageContent() {
  const [tenantLogoSrc, setTenantLogoSrc] = useState<string | undefined>(
    undefined,
  );
  const [lenderTenant, setLenderTenant] = useState<LenderInfo | null>(null);
  const [lenderInfoLoaded, setLenderInfoLoaded] = useState(false);
  const [products, setProducts] = useState<BorrowerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLenderInfo()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setTenantLogoSrc(
            resolveBorrowerLenderLogoSrc(res.data.logoUrl ?? null),
          );
          setLenderTenant(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLenderInfoLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPublicProducts()
      .then((res) => {
        if (!cancelled && res.success) {
          setProducts(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lender = useMemo(
    () =>
      mergeLenderFooterFields(
        {
          lenderName: LENDER_NAME,
          legalName: LENDER_LEGAL_NAME,
          email: LENDER_EMAIL,
          phone: LENDER_PHONE,
          phoneHref: LENDER_PHONE_HREF,
          ssm: LENDER_SSM,
          kpktLicense: LENDER_KPKT_LICENSE,
          addressLines: LENDER_ADDRESS_LINES,
        },
        lenderTenant,
      ),
    [lenderTenant],
  );

  const faqs = useMemo(
    (): { question: string; answer: ReactNode }[] => [
      {
        question: `Is ${lender.lenderName} legally licensed?`,
        answer: `Yes. ${lender.legalName} is a licensed money lender operating under the Moneylenders Act 1951, licensed by KPKT.`,
      },
      {
        question: "Who can apply for a loan?",
        answer:
          "Malaysian citizens or permanent residents aged 18 and above with a verifiable source of income may apply.",
      },
      {
        question: "How much can I borrow?",
        answer:
          "Use the loan calculator on this page for an indicative range. Final approved amounts depend on your income, existing commitments, and assessment outcome.",
      },
      {
        question: "How fast will I receive my funds?",
        answer:
          "Once your application is approved and your agreement is signed digitally, funds are transferred directly to your bank account.",
      },
      {
        question: "Are there any hidden fees?",
        answer:
          "No. Every charge is explained in your loan agreement before you sign. What you see is what you pay.",
      },
      {
        question: "Can I repay my loan early?",
        answer:
          "Yes. You may settle your outstanding balance at any time. Contact us or check your dashboard for the current payoff amount.",
      },
      {
        question: "How is my information protected?",
        answer: (
          <>
            We use industry-standard security and PDPA-compliant data handling.
            Read our{" "}
            <LegalNavLink
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="/legal/security"
              backSource="landing"
            >
              Cybersecurity
            </LegalNavLink>{" "}
            and{" "}
            <LegalNavLink
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="/legal/privacy"
              backSource="landing"
            >
              Privacy
            </LegalNavLink>{" "}
            pages for details.
          </>
        ),
      },
    ],
    [lender.legalName, lender.lenderName],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <HomeBrandMark
            tenantLogoSrc={tenantLogoSrc}
            lenderName={lender.lenderName}
            isLoading={!lenderInfoLoaded}
          />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {[
              { href: "#how-it-works", label: "How It Works" },
              { href: "#products", label: "Products" },
              { href: "#why-us", label: "Why Us" },
              { href: "#faq", label: "FAQ" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <HomeHeaderActions />
          </div>
        </div>
      </header>

      {/* ── Hero — KL skyline + brand overlay (towers framed high) ─ */}
      <section className="relative flex min-h-[28rem] items-center overflow-hidden border-b border-border/60 sm:min-h-[32rem] lg:min-h-[38rem]">
        <Image
          src="/landing/hero-kuala-lumpur3.jpg"
          alt="Kuala Lumpur skyline with Petronas Twin Towers"
          fill
          className="object-cover object-[50%_5%]"
          sizes="100vw"
          priority
        />
        {/* Readability: darken + primary tint */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-primary/55"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_85%_55%_at_50%_18%,rgba(255,255,255,0.08),transparent_55%)]"
          aria-hidden
        />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
          <div className="flex flex-col items-center text-center">
            <Badge
              variant="outline"
              className={cn(
                "mb-6 border-primary-foreground/35 bg-primary-foreground/[0.07] text-primary-foreground/90 backdrop-blur-[2px]",
                HERO_BODY_SHADOW,
                HERO_EDGE_SHADOW,
              )}
            >
              Licensed by KPKT Malaysia
            </Badge>

            <h1
              className={cn(
                "max-w-3xl font-heading text-4xl font-bold tracking-tight text-primary-foreground sm:text-5xl lg:text-6xl",
                HERO_TITLE_SHADOW,
              )}
            >
              Financial Freedom,{" "}
              <span className="text-primary-foreground/90 underline decoration-primary-foreground/30 decoration-[3px] underline-offset-[6px]">
                Simplified
              </span>
            </h1>

            <p
              className={cn(
                "mt-6 max-w-xl text-lg leading-8 text-primary-foreground/95",
                HERO_BODY_SHADOW,
              )}
            >
              Fast, transparent, and hassle-free loans for Malaysians. Apply
              online in minutes, get approved within 24 hours.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="shadow-[0_4px_20px_rgba(0,0,0,0.38)]"
              >
                <Link href="/sign-up">
                  Apply Now
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className={cn(
                  "border-primary-foreground/35 bg-black/15 text-primary-foreground backdrop-blur-[2px] hover:bg-primary-foreground/15 hover:text-primary-foreground",
                  HERO_BODY_SHADOW,
                  HERO_EDGE_SHADOW,
                )}
              >
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>

            {/* Trust pills */}
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {[
                { Icon: Lock, label: "256-bit SSL Secured" },
                { Icon: ShieldCheck, label: "PDPA Compliant" },
                { Icon: BadgeCheck, label: "Licensed Lender" },
              ].map(({ Icon, label }) => (
                <span
                  key={label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-primary-foreground/[0.07] px-3 py-1 text-xs font-medium text-primary-foreground/85 backdrop-blur-[2px]",
                    HERO_BODY_SHADOW,
                    HERO_EDGE_SHADOW,
                  )}
                >
                  <Icon
                    className={cn("h-3.5 w-3.5", HERO_ICON_DROP)}
                    aria-hidden
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Band ────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: "RM 50K", sub: "Max Loan" },
              { value: "24h", sub: "Approval" },
              { value: "18%", sub: "p.a. Rate" },
              { value: "36", sub: "Months Max" },
            ].map(({ value, sub }) => (
              <div key={sub} className="flex flex-col items-center gap-1">
                <span className="font-heading text-3xl font-bold text-primary sm:text-4xl">
                  {value}
                </span>
                <span className="text-sm text-muted-foreground">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works — vertical timeline ───────────────── */}
      <section id="how-it-works" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="outline">Simple Process</Badge>
            <h2 className="mt-3 font-heading text-3xl font-bold">
              Get Funded in 4 Easy Steps
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Our streamlined process gets you from application to funded in as
              little as 24 hours.
            </p>
          </div>

          <div className="relative mx-auto mt-14 max-w-2xl">
            {/* Vertical connector */}
            <div
              className="absolute left-6 top-0 hidden h-full w-px bg-border sm:block"
              aria-hidden
            />

            <div className="space-y-10">
              {HOW_IT_WORKS.map(({ step, title, description, Icon }, idx) => (
                <div key={step} className="relative flex gap-6 sm:gap-8">
                  {/* Step circle */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground shadow-md shadow-primary/20">
                    {step}
                  </div>

                  <div className="flex-1 pb-2">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                        <Icon
                          className="h-4 w-4 text-foreground"
                          aria-hidden
                        />
                      </div>
                      <h3 className="font-heading text-lg font-semibold text-foreground">
                        {title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                    {idx < HOW_IT_WORKS.length - 1 && (
                      <div className="mt-6 h-px w-full bg-border/50 sm:hidden" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Products ──────────────────────────────────────── */}
      <section id="products" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="outline">Our Products</Badge>
            <h2 className="mt-3 font-heading text-3xl font-bold">
              Choose Your Loan Type
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Flexible financing solutions tailored to your personal or business
              needs.
            </p>
          </div>

          <ProductCards products={products} loading={productsLoading} />
        </div>
      </section>

      {/* ── Why Us — 2-col feature grid ───────────────────── */}
      <section id="why-us" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="outline">Why {lender.lenderName}</Badge>
            <h2 className="mt-3 font-heading text-3xl font-bold">
              Built on Trust &amp; Transparency
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              We&apos;re not just another lender. Here&apos;s what makes us
              different.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-x-12 gap-y-10 sm:grid-cols-2">
            {WHY_US.map(({ title, description, Icon }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Loan Calculator ───────────────────────────────── */}
      <section
        id="calculator"
        className="border-b border-border/60 bg-secondary/20"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <Badge variant="outline">Loan Calculator</Badge>
              <h2 className="font-heading text-3xl font-bold">
                Estimate your repayments
              </h2>
              <p className="text-muted-foreground">
                Enter your income and existing commitments to see an indicative
                monthly repayment. Final figures are confirmed after your
                assessment.
              </p>
              <div className="space-y-3 pt-2">
                {[
                  "Indicative estimate based on your income",
                  "Adjust loan amount within your affordability",
                  "Final terms confirmed in your loan documentation",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden
                    />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <HomeLoanCalculator />
          </div>
        </div>
      </section>

      {/* ── FAQ — full-width accordion ────────────────────── */}
      <section id="faq" className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="outline">FAQ</Badge>
            <h2 className="mt-3 font-heading text-3xl font-bold">
              Common Questions
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Everything you need to know about our lending services.
            </p>
          </div>

          <Accordion
            type="single"
            collapsible
            className="mt-10 w-full divide-y divide-border"
          >
            {faqs.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="border-0"
              >
                <AccordionTrigger className="py-5 text-left text-sm font-semibold hover:no-underline [&>svg]:shrink-0">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────── */}
      <section className="border-b border-border/60 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="max-w-2xl font-heading text-3xl font-bold sm:text-4xl">
              Ready to Get Started?
            </h2>
            <p className="max-w-xl text-primary-foreground/80">
              Join Malaysians who trust {lender.lenderName} for their financial
              needs. Apply today and get funded within 24 hours.
            </p>
            <Button asChild variant="secondary" size="lg">
              <Link href="/sign-up">
                Apply Now — It&apos;s Free
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <p className="text-xs text-primary-foreground/60">
              No commitment required. Check your eligibility in minutes.
            </p>
          </div>
        </div>
      </section>

      <BorrowerProficientTruestackFooter
        lenderName={lender.lenderName}
        {...(tenantLogoSrc
          ? { brandLogoSrc: tenantLogoSrc, brandLogoAlt: lender.lenderName }
          : {})}
        legalName={lender.legalName}
        email={lender.email}
        phone={lender.phone}
        phoneHref={lender.phoneHref}
        ssm={lender.ssm}
        kpktLicense={lender.kpktLicense}
        addressLines={lender.addressLines}
        description={`${lender.legalName} provides this portal for online applications, loan servicing, and secure communications with borrowers.`}
        legalLong={danacreditBorrowerFooterLegalLong}
        legalShort={danacreditBorrowerFooterLegalShort}
        platformLinks={danacreditBorrowerFooterPlatformLinks}
      />
    </main>
  );
}
