"use client";

import type { LenderInfo } from "@kredit/borrower";
import Image from "next/image";
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
  proficientFooterLegalLong,
  proficientFooterLegalShort,
} from "@borrower_pro/lib/proficient-site-footer";
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
} from "@/app/components/legal/demo-site";

const ANNUAL_INTEREST_RATE = 18;
const AFFORDABILITY_FACTOR = 0.8;
const CALCULATOR_FOOTNOTE =
  "Indicative only—not a loan offer. Final terms are confirmed after assessment and appear in your loan documentation.";
const DEMO_NOTICE =
  "Demo only. This sample environment is not a real lending company unless you connect a live tenant.";
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
    step: "01",
    title: "Apply Online",
    description: "Fill out our simple application form in under 5 minutes. No branch visit needed.",
    Icon: Smartphone,
  },
  {
    step: "02",
    title: "Quick Review",
    description: "Our team reviews your application and assesses your eligibility within hours.",
    Icon: Clock,
  },
  {
    step: "03",
    title: "Sign Digitally",
    description: "E-sign your loan agreement securely online. No paperwork, no queues.",
    Icon: Pencil,
  },
  {
    step: "04",
    title: "Receive Funds",
    description: "Once approved, money is transferred directly to your bank account.",
    Icon: BanknoteArrowUp,
  },
] as const;

const WHY_US = [
  {
    title: "KPKT Licensed",
    description: "Fully licensed under the Moneylenders Act 1951. Your trust is protected by regulation.",
    Icon: BadgeCheck,
  },
  {
    title: "Transparent Rates",
    description: "Clear interest rates disclosed upfront. No surprises, no hidden calculations.",
    Icon: FileText,
  },
  {
    title: "No Hidden Fees",
    description: "Every charge is explained in your agreement. What you see is what you pay.",
    Icon: ShieldCheck,
  },
  {
    title: "Fast Approval",
    description: "Fast decisions powered by our streamlined review process. Time is money.",
    Icon: Zap,
  },
  {
    title: "Bank-Level Security",
    description: "Your data is protected with enterprise-grade encryption and PDPA compliance.",
    Icon: Lock,
  },
  {
    title: "100% Digital",
    description: "Apply, sign, and manage your loan entirely online. No branch visits needed.",
    Icon: Smartphone,
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
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied / remote tenant logo */}
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
      {/* eslint-disable-next-line @next/next/no-img-element -- static public assets; theme swap */}
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
        <Link href="/sign-up">Explore demo</Link>
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
    <Card id="loan-calculator" className="border-border/70 bg-card/95 shadow-lg shadow-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Demo loan estimate</Badge>
          <Badge variant="outline">{ANNUAL_INTEREST_RATE}% p.a. example</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl sm:text-3xl">How much can I borrow?</CardTitle>
          <CardDescription className="mt-2">
            Enter income and commitments to see an indicative monthly repayment. {DEMO_NOTICE}
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
            <p className="text-xs text-muted-foreground">Gross income including salary and other sources.</p>
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
                      Include other loans (house/car) and recurring obligations (rent, utilities).
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
                      Illustrative demo—not underwriting or a real offer.
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
              Explore demo
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-up">
                Explore demo
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          )}

          <p className="text-xs leading-6 text-muted-foreground">
            Flat {ANNUAL_INTEREST_RATE}% p.a. over the term.
            {result.hasCapacity && result.chosenLoanAmount > 0 && (
              <> Total repayable {formatCurrency(result.chosenTotalRepayable)} (principal + interest). </>
            )}
            {CALCULATOR_FOOTNOTE} {DEMO_NOTICE}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductCards({ products, loading }: { products: BorrowerProduct[]; loading: boolean }) {
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
                {[0, 1, 2].map((j) => <Skeleton key={j} className="h-16 rounded-lg" />)}
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
        <p className="text-muted-foreground">No loan products are currently available. Please check back soon.</p>
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {products.map((product) => {
        const maxAmount = typeof product.maxAmount === "number" ? product.maxAmount : Number(product.maxAmount);
        const interestRate = typeof product.interestRate === "number" ? product.interestRate : Number(product.interestRate);
        const docs = product.requiredDocuments ?? [];
        const isCorporate = product.eligibleBorrowerTypes?.includes("CORPORATE");
        const Icon = isCorporate ? Building2 : User;
        const typeLabel = isCorporate ? "For Business Growth" : "For Individual Needs";

        return (
          <Card key={product.id} className="border-border/70 bg-background">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.description ?? typeLabel}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Max Amount", value: maxAmount > 0 ? `RM ${(maxAmount / 1000).toFixed(0)}K` : "—" },
                  { label: "Rate p.a.", value: interestRate > 0 ? `${interestRate}%` : "—" },
                  { label: "Max Term", value: product.maxTerm > 0 ? `${product.maxTerm} months` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-center">
                    <p className="font-heading text-lg font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {docs.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-foreground">Documents Needed</p>
                  <ul className="space-y-1.5">
                    {docs.map((doc) => (
                      <li key={doc.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                        {doc.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button asChild className="w-full">
                <Link href="/sign-up">Explore demo · {product.name}</Link>
              </Button>
            </CardContent>
          </Card>
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
      question: "Is this demonstration or production lending?",
      answer: `${DEMO_NOTICE} Footer and tenant branding reflect your Connected Tenant when configured.`,
    },
    {
      question: `Who is ${lender.lenderName}?`,
      answer: `${lender.legalName} is shown as sample tenant data—a licensed-money-lender borrower portal layout for Malaysia when your tenant is connected.`,
    },
    {
      question: `Is ${lender.lenderName} legally licensed when live?`,
      answer: `${lender.legalName}, when connected to production data, is expected to operate as a licensed money lender under the Moneylenders Act 1951.`,
    },
    {
      question: "Who can apply?",
      answer:
        "Malaysian citizens or permanent residents aged 18 and above with a verifiable source of income may apply in a configured deployment.",
    },
    {
      question: "Is the calculator a loan offer?",
      answer:
        "No. The calculator uses illustrative assumptions to help you understand possible repayment ranges. A formal assessment is required for any real loan offer.",
    },
    {
      question: "How much can I borrow?",
      answer:
        "Use the sandbox calculator below for indicative figures. Approved amounts depend on income, commitments, and assessment outcomes in production.",
    },
    {
      question: "How fast will funds be disbursed?",
      answer:
        "In a production deployment, once approved and digitally signed, funds are typically transferred to your nominated bank account per your lender’s process.",
    },
    {
      question: "Are there any hidden fees?",
      answer:
        "No. Charges are disclosed in loan documentation before signing. What you see is what you pay.",
    },
    {
      question: "How is my information protected?",
      answer: (
        <>
          Industry-standard security and PDPA-aligned handling apply. Read{" "}
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
          </LegalNavLink>
          .
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
          {" "}(sandbox contact from tenant configuration).
        </>
      ),
    },
  ], [lender.email, lender.legalName, lender.lenderName]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/60 bg-secondary/50">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-sm leading-6 text-foreground">
            <span className="font-semibold">Important:</span> {DEMO_NOTICE}
          </p>
        </div>
      </div>
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <HomeBrandMark
            tenantLogoSrc={tenantLogoSrc}
            lenderName={lender.lenderName}
            isLoading={!lenderInfoLoaded}
          />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground">
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

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid min-h-[480px] gap-0 lg:grid-cols-2">
            {/* Left: copy */}
            <div className="flex flex-col justify-center py-16 pr-0 lg:py-24 lg:pr-12">
              <div className="space-y-6">
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Borrower portal demo · Malaysia
                </Badge>
                <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                  Financial freedom,{" "}
                  <span className="text-primary">simplified.</span>
                </h1>
                <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                  Fast, transparent, and hassle-free loans for Malaysians. Apply online in minutes, manage everything from one secure portal.{" "}
                  <span className="block pt-2 text-xs text-muted-foreground/90">{DEMO_NOTICE}</span>
                </p>

                {/* Trust badges */}
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { Icon: Lock, label: "SSL Secured" },
                    { Icon: ShieldCheck, label: "PDPA Compliant" },
                    { Icon: BadgeCheck, label: "KPKT Licensed" },
                  ].map(({ Icon, label }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                      {label}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button asChild size="lg">
                    <Link href="/sign-up">
                      Explore demo — it&apos;s free
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="#how-it-works">See How It Works</a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">No commitment required. Check your eligibility in minutes.</p>
              </div>
            </div>

            {/* Right: KL skyline — semantic scrims (theme-aware via `background`) */}
            <div className="relative hidden min-h-[320px] overflow-hidden lg:block">
              <Image
                src="/landing/hero-kuala-lumpur-night5.png"
                alt="Kuala Lumpur skyline at night"
                fill
                className="-scale-x-100 object-cover object-[10%_30%]"
                sizes="50vw"
                priority
              />
              {/* Feather into copy column */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[min(38%,15rem)] bg-gradient-to-r from-background via-background/55 to-transparent sm:w-[min(34%,17rem)]"
                aria-hidden
              />
              {/* Feather into stats band below */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-background to-transparent sm:h-28"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Max Personal Loan", value: "Up to RM 30K" },
              { label: "Max Business Loan", value: "Up to RM 50K" },
              { label: "Interest Rate", value: "18% p.a." },
              { label: "Approval Time", value: "Within 24h" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-heading text-xl font-bold text-foreground sm:text-2xl">{value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────── */}
      <section id="how-it-works" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">How It Works</Badge>
            <h2 className="font-heading text-3xl font-bold">Get Funded in 4 Easy Steps</h2>
            <p className="text-muted-foreground">
              Our streamlined process gets you from application to funded in as little as 24 hours.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map(({ step, title, description, Icon }) => (
              <div key={step} className="relative">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-heading font-bold text-sm">
                      {step}
                    </div>
                    <div className="hidden h-px flex-1 bg-border/70 lg:block" />
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary">
                    <Icon className="h-5 w-5 text-foreground" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-heading font-semibold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products ───────────────────────────────────────────── */}
      <section id="products" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Our Products</Badge>
            <h2 className="font-heading text-3xl font-bold">Choose Your Loan Type</h2>
            <p className="text-muted-foreground">
              Flexible financing solutions tailored to your personal or business needs.
            </p>
          </div>

          <ProductCards products={products} loading={productsLoading} />
        </div>
      </section>

      {/* ── Why Us ─────────────────────────────────────────────── */}
      <section id="why-us" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Why {lender.lenderName}</Badge>
            <h2 className="font-heading text-3xl font-bold">Built on Trust &amp; Transparency</h2>
            <p className="text-muted-foreground">
              We&apos;re not just another lender. Here&apos;s what makes us different.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_US.map(({ title, description, Icon }) => (
              <Card key={title} className="border-border/70 bg-background">
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-primary/8">
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Loan Calculator ────────────────────────────────────── */}
      <section id="calculator" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              <Badge variant="outline">Loan Calculator</Badge>
              <h2 className="font-heading text-3xl font-bold">Estimate your repayments</h2>
              <p className="text-muted-foreground">
                Sandbox figures for illustrative use; connect a tenant for live catalogue and rates.
              </p>
              <div className="space-y-3 pt-2">
                {[
                  "Indicative estimate based on your income (demo maths)",
                  "Adjust loan amount within your affordability slider",
                  "Final terms confirmed in real loan documentation",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <HomeLoanCalculator />
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">FAQ</Badge>
            <h2 className="font-heading text-3xl font-bold">Common Questions</h2>
            <p className="text-muted-foreground">
              Sandbox answers and links to your configured tenant contact email.
            </p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <Accordion type="single" collapsible className="w-full divide-y divide-border rounded-xl border border-border/70 bg-background px-2">
              {faqs.map((item) => (
                <AccordionItem
                  key={item.question}
                  value={item.question}
                  className="border-0 first:border-0"
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

            <Card className="border-border/70 bg-primary/5 h-fit">
              <CardHeader>
                <CardTitle>Ready to get started?</CardTitle>
                <CardDescription>
                  Walk through the sandbox borrower flow, or sign in with existing demo access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/sign-up">Explore demo signup</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <a href={`mailto:${lender.email}`}>
                    Email us <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="font-heading text-3xl font-bold sm:text-4xl">
              Walk through the Malaysian licensed-lender borrower UX in sandbox mode.
            </h2>
            <p className="max-w-xl text-primary-foreground/80">
              {`${lender.lenderName} showcases how TrueStack portals look for borrowers. Explore flows with no lending commitment. ${DEMO_NOTICE}`}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild variant="secondary" size="lg">
                <Link href="/sign-up">
                  Explore demo
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="text-xs text-primary-foreground/60">
              No obligation—use illustrative numbers only in this demo.
            </p>
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
        legalLong={proficientFooterLegalLong}
        legalShort={proficientFooterLegalShort}
      />
    </main>
  );
}
