"use client";

import type { LenderInfo } from "@kredit/borrower";
import Link from "next/link";
import { LegalNavLink } from "@borrower_pro/components/legal/legal-nav-link";
import { mergeLenderFooterFields } from "@borrower_pro/lib/merge-tenant-lender-display";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
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
  Wallet,
  Zap,
} from "lucide-react";
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
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
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
} from "@/app/components/legal/proficient-site";

const ANNUAL_INTEREST_RATE = 18;
const AFFORDABILITY_FACTOR = 0.8;
const CALCULATOR_FOOTNOTE =
  "Indicative only—not a loan offer. Final terms are confirmed after assessment and appear in your loan documentation.";
const TERM_MONTHS_OPTIONS = [6, 12, 18, 24] as const;
const MAX_LOAN_ROUND_STEP = 100;

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
    step: 1,
    title: "Apply Online",
    description: "Complete our simple application form in minutes — no branch visit required.",
    Icon: Smartphone,
  },
  {
    step: 2,
    title: "Quick Assessment",
    description: "Our team reviews your application and verifies your eligibility.",
    Icon: Clock,
  },
  {
    step: 3,
    title: "Sign Digitally",
    description: "Review and e-sign your loan agreement securely online.",
    Icon: Pencil,
  },
  {
    step: 4,
    title: "Funds Disbursed",
    description: "Approved funds are transferred directly to your nominated bank account.",
    Icon: BanknoteArrowUp,
  },
] as const;

const WHY_US = [
  {
    title: "KPKT Licensed & Regulated",
    description:
      "Fully licensed under the Moneylenders Act 1951. We operate with full regulatory oversight — your protection is guaranteed.",
    Icon: BadgeCheck,
    accent: "text-foreground",
  },
  {
    title: "Transparent, No-Surprise Rates",
    description:
      "Every rate, fee, and repayment schedule is disclosed before you sign. We have no hidden charges.",
    Icon: FileText,
    accent: "text-foreground",
  },
  {
    title: "Enterprise-Grade Security",
    description:
      "256-bit SSL encryption and full PDPA compliance protect your personal and financial data.",
    Icon: Lock,
    accent: "text-foreground",
  },
  {
    title: "Fast, Digital-First Process",
    description:
      "Apply, sign, and manage everything online. Our streamlined review process delivers decisions quickly.",
    Icon: Zap,
    accent: "text-foreground",
  },
] as const;

function HomeBrandMark({
  tenantLogoSrc,
  lenderName,
  isLoading,
}: {
  tenantLogoSrc?: string;
  lenderName: string;
  isLoading: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isLoading) {
    return (
      <Link href="/" className="flex items-center" aria-label={`${lenderName} home`}>
        <div className="h-[3.25rem] w-[11rem] animate-pulse rounded-md bg-muted sm:h-[3.575rem]" />
      </Link>
    );
  }

  if (tenantLogoSrc) {
    return (
      <Link href="/" className="flex items-center" aria-label={`${lenderName} home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tenantLogoSrc}
          alt={`${lenderName} logo`}
          className="h-[3.25rem] w-auto max-w-[286px] object-contain object-left sm:h-[3.575rem]"
          width={338}
          height={57}
        />
      </Link>
    );
  }

  const platformLogoSrc =
    mounted && resolvedTheme === "dark"
      ? "/truestack-logo-dark.png"
      : "/truestack-logo-light.png";

  return (
    <Link href="/" className="flex items-center" aria-label={`${lenderName} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={platformLogoSrc}
        alt="TrueStack"
        className="h-[3.25rem] w-auto max-w-[286px] sm:h-[3.575rem]"
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
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="outline" className="hidden sm:inline-flex">
        <Link href={hasValidSession ? "/dashboard" : "/sign-in"}>
          {hasValidSession ? "Dashboard" : "Sign in"}
        </Link>
      </Button>
      <Button asChild>
        <Link href="/sign-up">Apply now</Link>
      </Button>
    </div>
  );
}

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
    const remainingAfterCommitments = safeSubtract(affordabilityCap, commitmentsValue);
    const availableMonthlyRepayment = remainingAfterCommitments > 0 ? remainingAfterCommitments : 0;
    const canAssess = termMonths > 0 && incomeValue > 0;
    const annualRateDecimal = safeDivide(ANNUAL_INTEREST_RATE, 100, 8);
    const termYears = termMonths > 0 ? safeDivide(termMonths, 12, 8) : 0;
    const repaymentFactor =
      termMonths > 0 ? safeAdd(1, safeMultiply(annualRateDecimal, termYears, 8)) : 0;
    const maxLoanRaw =
      canAssess && availableMonthlyRepayment > 0 && repaymentFactor > 0
        ? safeDivide(safeMultiply(availableMonthlyRepayment, termMonths, 8), repaymentFactor)
        : 0;
    const maxLoanAmount = floorToStep(maxLoanRaw, MAX_LOAN_ROUND_STEP);
    const hasCapacity = canAssess && maxLoanAmount > 0;
    const chosenRaw =
      maxLoanAmount > 0 ? safeDivide(safeMultiply(maxLoanAmount, loanAmountPercent, 8), 100, 8) : 0;
    const chosenLoanAmount =
      maxLoanAmount > 0
        ? Math.min(roundToNearestStep(chosenRaw, MAX_LOAN_ROUND_STEP), maxLoanAmount)
        : 0;
    const chosenTotalInterest =
      chosenLoanAmount > 0 && termMonths > 0
        ? calculateFlatInterest(chosenLoanAmount, ANNUAL_INTEREST_RATE, termMonths)
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
    result.remainingAfterCommitments < 0 ? safeSubtract(0, result.remainingAfterCommitments) : 0;

  return (
    <Card id="loan-calculator" className="border-border/70 bg-card/95 shadow-lg shadow-secondary/30">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Loan estimate</Badge>
          <Badge variant="outline">{ANNUAL_INTEREST_RATE}% p.a. example</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl sm:text-3xl">How much can I borrow?</CardTitle>
          <CardDescription className="mt-2">
            Enter your income and commitments to see an indicative monthly repayment. Final figures are confirmed after assessment.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="loan-term-slider">Loan term</Label>
              <span className="text-sm font-medium tabular-nums text-foreground">{result.termMonths} months</span>
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
              {TERM_MONTHS_OPTIONS.map((m) => <span key={m}>{m}</span>)}
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
            <p className="text-xs text-muted-foreground">Gross income including salary and other income sources.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="current-commitments">Current monthly commitments (RM)</Label>
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
                    <p>Monthly commitments, including EPF contributions, tax, and similar deductions.</p>
                    <p className="mt-1 text-xs opacity-70">
                      Commitments should include other loans and recurring obligations.
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
                result.canAssess ? "border-error/30 bg-error/10" : "border-border/70 bg-secondary/40"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {result.canAssess ? (
                    <CircleAlert className="h-5 w-5 text-error" aria-hidden />
                  ) : (
                    <Calculator className="h-5 w-5 text-foreground" aria-hidden />
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
                      Add your income to see an indicative range. This is not a credit decision.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className={cn(
              "space-y-4",
              !result.hasCapacity && "rounded-lg border border-border/60 bg-muted/20 p-4 opacity-60"
            )}
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="loan-amount-share-slider">Loan amount</Label>
              <div className="text-right text-sm tabular-nums text-foreground">
                <span className="font-medium">{formatCurrency(result.chosenLoanAmount)}</span>
                <span className="text-muted-foreground"> / {formatCurrency(result.maxLoanAmount)} max</span>
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
              <p className="mt-2 text-2xl font-heading font-semibold text-foreground">
                {formatCurrency(result.chosenLoanAmount)}
              </p>
            </div>
            <div className="rounded-xl border border-success/25 bg-success/10 p-4">
              <p className="text-sm text-muted-foreground">Monthly repayment</p>
              <p className="mt-2 text-2xl font-heading font-semibold text-foreground">
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
            Affordability sets your maximum; the slider is your chosen amount within that ceiling (flat {ANNUAL_INTEREST_RATE}% p.a. over the term).
            {result.hasCapacity && result.chosenLoanAmount > 0 && (
              <> Total repayable {formatCurrency(result.chosenTotalRepayable)} (principal + interest). </>
            )}
            {CALCULATOR_FOOTNOTE}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductRows({ products, loading }: { products: BorrowerProduct[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-5">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-6 rounded-2xl border border-border/70 bg-background p-6 md:grid-cols-[auto_1fr_auto]">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64" />
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((j) => <Skeleton key={j} className="h-6 w-20 rounded-full" />)}
              </div>
            </div>
            <div className="flex items-start md:items-center">
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-background p-8 text-center">
        <p className="text-muted-foreground">No loan products are currently available. Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {products.map((product) => {
        const maxAmount = typeof product.maxAmount === "number" ? product.maxAmount : Number(product.maxAmount);
        const interestRate = typeof product.interestRate === "number" ? product.interestRate : Number(product.interestRate);
        const docs = product.requiredDocuments ?? [];
        const isCorporate = product.eligibleBorrowerTypes?.includes("CORPORATE");
        const Icon = isCorporate ? Building2 : User;
        const summary = [
          maxAmount > 0 ? `up to RM ${maxAmount.toLocaleString()}` : null,
          interestRate > 0 ? `${interestRate}% p.a.` : null,
          product.maxTerm > 0 ? `up to ${product.maxTerm} months` : null,
        ].filter(Boolean).join(" · ");

        return (
          <div key={product.id} className="grid gap-6 rounded-2xl border border-border/70 bg-background p-6 md:grid-cols-[auto_1fr_auto]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">{product.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {product.description ?? summary}
                </p>
              </div>
              {docs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {docs.map((doc) => (
                    <span key={doc.key} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/60 px-2.5 py-0.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
                      {doc.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-start md:items-center">
              <Button asChild variant="outline" size="sm">
                <Link href="/sign-up">Apply <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden /></Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HomePageContent() {
  const [tenantLogoSrc, setTenantLogoSrc] = useState<string | undefined>(undefined);
  const [lenderTenant, setLenderTenant] = useState<LenderInfo | null>(null);
  const [lenderInfoLoaded, setLenderInfoLoaded] = useState(false);
  const [products, setProducts] = useState<BorrowerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLenderInfo()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setTenantLogoSrc(resolveBorrowerLenderLogoSrc(res.data.logoUrl ?? null));
          setLenderTenant(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLenderInfoLoaded(true);
      });
    return () => { cancelled = true; };
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
    return () => { cancelled = true; };
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
        lenderTenant
      ),
    [lenderTenant]
  );

  const faqs = useMemo((): { question: string; answer: ReactNode }[] => [
    {
      question: `Who is ${lender.lenderName}?`,
      answer: `${lender.legalName} is a licensed money lender offering personal and business loans through this secure online borrower portal.`,
    },
    {
      question: "Who can apply?",
      answer:
        "Malaysian citizens or permanent residents aged 18 and above with a verifiable source of income. Business loan applicants must provide company registration documents.",
    },
    {
      question: "Is the calculator a loan offer?",
      answer:
        "No. The calculator uses illustrative assumptions to help you understand possible repayment ranges. A formal credit assessment is required for any loan offer.",
    },
    {
      question: "How do I apply?",
      answer:
        "Create an account, complete onboarding, and submit a loan application from your dashboard. You can track status and messages in the portal at any time.",
    },
    {
      question: "Are there any hidden fees?",
      answer:
        "No. Every charge is fully disclosed in your loan agreement before you sign. What you see is what you pay.",
    },
    {
      question: "How is my information protected?",
      answer: (
        <>
          We use industry-standard sign-in and PDPA-compliant data handling. Read our{" "}
          <LegalNavLink
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="/security"
            backSource="landing"
          >
            Cybersecurity
          </LegalNavLink>{" "}
          and{" "}
          <LegalNavLink
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="/privacy"
            backSource="landing"
          >
            Privacy
          </LegalNavLink>{" "}
          pages for details.
        </>
      ),
    },
    {
      question: "Who can I contact?",
      answer: (
        <>
          Email{" "}
          <a
            href={`mailto:${lender.email}`}
            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/90"
          >
            {lender.email}
          </a>
          .
        </>
      ),
    },
  ], [lender.email, lender.legalName, lender.lenderName]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <HomeBrandMark
            tenantLogoSrc={tenantLogoSrc}
            lenderName={lender.lenderName}
            isLoading={!lenderInfoLoaded}
          />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#process" className="text-muted-foreground transition-colors hover:text-foreground">
              How It Works
            </a>
            <a href="#products" className="text-muted-foreground transition-colors hover:text-foreground">
              Products
            </a>
            <a href="#why-us" className="text-muted-foreground transition-colors hover:text-foreground">
              Why Us
            </a>
            <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <HomeHeaderActions />
          </div>
        </div>
      </header>

      {/* ── Hero: Split-screen layout ───────────────────────────── */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid min-h-[480px] gap-0 lg:grid-cols-2">
            {/* Left: text */}
            <div className="flex flex-col justify-center py-16 pr-0 lg:py-24 lg:pr-12">
              <div className="space-y-6">
                <Badge variant="outline">Borrower Portal · Malaysia</Badge>
                <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
                  Borrow with confidence.{" "}
                  <span className="text-muted-foreground">Repay with clarity.</span>
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  {lender.lenderName} is a licensed money lender offering transparent personal and business loans in Malaysia. Apply online, sign digitally, and manage everything in one place.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg">
                    <Link href="/sign-up">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="#process">How It Works</a>
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-5">
                  {[
                    { Icon: BadgeCheck, label: "KPKT Licensed" },
                    { Icon: Lock, label: "SSL Secured" },
                    { Icon: ShieldCheck, label: "PDPA Compliant" },
                  ].map(({ Icon, label }) => (
                    <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Stats / Key Numbers panel */}
            <div className="flex flex-col justify-center border-l border-border/60 bg-secondary/30 px-8 py-16 lg:py-24">
              <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                At a glance
              </p>
              <div className="space-y-8">
                {[
                  { value: "RM 50,000", label: "Maximum Business Loan" },
                  { value: "RM 30,000", label: "Maximum Personal Loan" },
                  { value: "18% p.a.", label: "Flat Interest Rate" },
                  { value: "36 months", label: "Maximum Loan Term" },
                ].map(({ value, label }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-foreground" />
                    <div>
                      <p className="font-heading text-2xl font-bold text-foreground">{value}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works: Horizontal timeline ──────────────────── */}
      <section id="process" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 space-y-3">
            <Badge variant="outline">Simple Process</Badge>
            <h2 className="font-heading text-3xl font-bold">Four steps to funding</h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map(({ step, title, description, Icon }, i) => (
              <div key={step} className="relative flex flex-col gap-4">
                {/* Step number + dashed connector */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground">
                    {String(step).padStart(2, "0")}
                  </div>
                  {/* Dashed line leading to next step */}
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div
                      className="hidden min-h-0 flex-1 self-center border-t-2 border-dashed border-foreground/35 lg:block"
                      aria-hidden
                    />
                  )}
                </div>
                {/* Icon */}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
                  <Icon className="h-5 w-5 text-foreground" aria-hidden />
                </div>
                {/* Text */}
                <div className="space-y-1">
                  <h3 className="font-heading font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products: Stacked cards ─────────────────────────────── */}
      <section id="products" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 space-y-3">
            <Badge variant="outline">Loan Products</Badge>
            <h2 className="font-heading text-3xl font-bold">Choose the right loan for you</h2>
          </div>

          <ProductRows products={products} loading={productsLoading} />
        </div>
      </section>

      {/* ── Why Us: Alternating rows ────────────────────────────── */}
      <section id="why-us" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 space-y-3">
            <Badge variant="outline">Why {lender.lenderName}</Badge>
            <h2 className="font-heading text-3xl font-bold">Built for your confidence</h2>
          </div>

          <div className="space-y-6">
            {WHY_US.map(({ title, description, Icon }, i) => (
              <div
                key={title}
                className={cn(
                  "flex flex-col gap-5 rounded-2xl border border-border/70 bg-background p-6 sm:flex-row sm:items-start",
                  i % 2 === 1 && "sm:flex-row-reverse"
                )}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
                  <Icon className="h-5 w-5 text-foreground" aria-hidden />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-heading font-semibold text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Loan Calculator ────────────────────────────────────── */}
      <section id="calculator" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
            <div className="space-y-4">
              <Badge variant="outline">Loan Calculator</Badge>
              <h2 className="font-heading text-3xl font-bold">Estimate your repayments</h2>
              <p className="text-muted-foreground">
                Get a clear picture of what you could borrow and repay each month before committing to an application.
              </p>
              <ul className="space-y-3 pt-1">
                {[
                  "Based on your declared income and commitments",
                  "Adjust the loan amount within your affordability ceiling",
                  "All figures are indicative — confirmed after formal assessment",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <HomeLoanCalculator />
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 space-y-3">
            <Badge variant="outline">FAQ</Badge>
            <h2 className="font-heading text-3xl font-bold">Common questions</h2>
            <p className="text-muted-foreground">
              Answers to everything you need to know about applying and borrowing with us.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <Accordion type="single" collapsible className="w-full space-y-2">
              {faqs.map((item) => (
                <AccordionItem
                  key={item.question}
                  value={item.question}
                  className="rounded-xl border border-border/70 bg-background px-4"
                >
                  <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background p-6">
                <h3 className="font-heading font-semibold text-foreground">Ready to apply?</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Create an account and apply in minutes. No commitment required.
                </p>
                <div className="mt-4 space-y-2">
                  <Button asChild className="w-full">
                    <Link href="/sign-up">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/sign-in">Sign in</Link>
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background p-6">
                <h3 className="font-heading font-semibold text-foreground">Need help?</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Our team is available via email.
                </p>
                <a
                  href={`mailto:${lender.email}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {lender.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-foreground text-background">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-2">
              <h2 className="font-heading text-3xl font-bold">Start your application today.</h2>
              <p className="text-background/70">
                Transparent rates, no hidden fees, fast decisions. Join borrowers who trust {lender.lenderName}.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background"
              >
                <Link href="/sign-up">
                  Apply Now <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <BorrowerProficientTruestackFooter
        lenderName={lender.lenderName}
        {...(tenantLogoSrc ? { brandLogoSrc: tenantLogoSrc, brandLogoAlt: lender.lenderName } : {})}
        legalName={lender.legalName}
        email={lender.email}
        phone={lender.phone}
        phoneHref={lender.phoneHref}
        ssm={lender.ssm}
        kpktLicense={lender.kpktLicense}
        addressLines={lender.addressLines}
        description={`${lender.legalName} provides this portal for online applications, loan servicing, and secure communications with borrowers.`}
      />
    </main>
  );
}
