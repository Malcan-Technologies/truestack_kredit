"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  FileText,
  ShieldCheck,
  Wallet,
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
import { fetchBorrowerMe } from "@borrower_pro/lib/borrower-auth-client";
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

const ANNUAL_INTEREST_RATE = 18;
/** Demo-only: monthly repayment budget as a share of net income (not shown in UI). */
const AFFORDABILITY_FACTOR = 0.8;
const DEMO_NOTICE =
  "Demo only. Demo Client is not a real lending company. Figures shown here are illustrative and do not represent a real loan offer, approval, or underwriting decision.";
const TERM_MONTHS_OPTIONS = [6, 12, 18, 24, 36] as const;
/** Floor max loan to this step (e.g. 24,406.78 → 24,400). */
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
    title: "Pick term, income, commitments",
    description:
      "Borrowers set the loan length, net income, and existing monthly commitments for an instant example.",
    Icon: Calculator,
  },
  {
    title: "A simple first step",
    description:
      "The homepage sets expectations before sign-up—nothing here replaces real underwriting.",
    Icon: Wallet,
  },
  {
    title: "Instant demo numbers",
    description:
      "See an indicative maximum loan and repayment using the flat-rate example on this page.",
    Icon: CheckCircle2,
  },
] as const;

const BENEFITS = [
  {
    title: "Client-facing borrower experience",
    description:
      "This page is positioned as a branded digital front door that a licensed money lender can adapt for prospective borrowers.",
    Icon: Clock3,
  },
  {
    title: "Readable at a glance",
    description:
      "Short labels and big numbers keep the demo easy to scan in client walkthroughs.",
    Icon: FileText,
  },
  {
    title: "Suitable for demo and sales use",
    description:
      "Repeated disclaimers keep the experience safe for demos, proposals, and client walkthroughs without implying a live lending operation.",
    Icon: ShieldCheck,
  },
] as const;

const FAQS = [
  {
    question: "Who is this homepage designed for?",
    answer:
      "This demo is designed for licensed money lenders evaluating what a borrower-facing website could look like for KPKT digital licence lending.",
  },
  {
    question: "Is Demo Client a real lender?",
    answer:
      "No. This site is a demonstration environment only. It does not issue real loans, process real approvals, or represent a live moneylending business.",
  },
  {
    question: "How is the calculator intended to be used?",
    answer:
      "It is an illustrative front-end tool that shows how your borrowers might receive an initial repayment estimate and affordability outcome before they continue to the application flow.",
  },
  {
    question: "How does the demo eligibility check work?",
    answer:
      "It uses your net income, current monthly commitments, the term you choose, and a flat 18% p.a. example to estimate indicative figures. It is not a credit decision.",
  },
] as const;

function HomeBrandMark() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    mounted && resolvedTheme === "dark"
      ? "/truestack-logo-dark.png"
      : "/truestack-logo-light.png";

  return (
    <Link
      href="/"
      className="flex items-center"
      aria-label="Demo Client home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static public assets; theme swap */}
      <img
        src={logoSrc}
        alt="TrueStack"
        className="h-10 w-auto max-w-[220px] sm:h-11"
        width={260}
        height={44}
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
        if (!cancelled && res.success) {
          setHasValidSession(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasValidSession(false);
        }
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
        <Link href="/sign-up">Explore demo</Link>
      </Button>
    </div>
  );
}

function HomeLoanCalculator() {
  const [termIndex, setTermIndex] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState("4500");
  const [currentCommitments, setCurrentCommitments] = useState("1200");
  /** 0–100: share of maximum loan amount to borrow. */
  const [loanAmountPercent, setLoanAmountPercent] = useState(100);

  const result = useMemo(() => {
    const termMonths = TERM_MONTHS_OPTIONS[termIndex] ?? 12;
    const incomeValue = toSafeNumber(monthlyIncome);
    const commitmentsValue = toSafeNumber(currentCommitments);
    const affordabilityCap = safeMultiply(incomeValue, AFFORDABILITY_FACTOR);
    const remainingAfterCommitments = safeSubtract(affordabilityCap, commitmentsValue);
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
        ? safeDivide(safeMultiply(availableMonthlyRepayment, termMonths, 8), repaymentFactor)
        : 0;
    const maxLoanAmount = floorToStep(maxLoanRaw, MAX_LOAN_ROUND_STEP);
    const hasCapacity = canAssess && maxLoanAmount > 0;

    const chosenRaw =
      maxLoanAmount > 0
        ? safeDivide(safeMultiply(maxLoanAmount, loanAmountPercent, 8), 100, 8)
        : 0;
    const chosenLoanAmount =
      maxLoanAmount > 0
        ? Math.min(
            roundToNearestStep(chosenRaw, MAX_LOAN_ROUND_STEP),
            maxLoanAmount
          )
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
    result.remainingAfterCommitments < 0
      ? safeSubtract(0, result.remainingAfterCommitments)
      : 0;

  return (
    <Card
      id="loan-calculator"
      className="border-border/70 bg-card/95 shadow-lg shadow-secondary/30"
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Demo calculator</Badge>
          <Badge variant="outline">18% p.a. example</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl sm:text-3xl">Eligibility checker</CardTitle>
          <CardDescription className="mt-2">
            Enter income and commitments, then tune how much you want to borrow up to your
            maximum—estimated repayment updates for that loan amount. Illustrative only—not an
            offer.
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
                onChange={(event) => setMonthlyIncome(event.target.value)}
                placeholder="4500"
              />
              <p className="text-xs text-muted-foreground">
                Gross income including salary and other income sources.
              </p>
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
                      <p>
                        Monthly commitments, including EPF
                        contributions, tax, and similar deductions.
                      </p>
                      <p className="mt-1 text-xs opacity-70">
                        Commitments should include other loans (eg. house / car loans) and recurring obligations (eg. rent, utilities, etc.).
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
                onChange={(event) => setCurrentCommitments(event.target.value)}
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
                    : "border-border/70 bg-secondary/40"
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
                        Illustrative demo only—not underwriting or a real offer.
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
              {/* <p className="text-xs text-muted-foreground">
                Borrow less than your ceiling to see a lower monthly instalment for this loan
                (flat {ANNUAL_INTEREST_RATE}% p.a. example).
              </p> */}
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
                Apply now
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link href="/sign-up">
                  Apply now
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            )}

            <p className="text-xs leading-6 text-muted-foreground">
              Indicative math only (demo model). Affordability sets your ceiling; repayment is
              for the loan amount you choose (flat {ANNUAL_INTEREST_RATE}% p.a. over the term).
              {result.hasCapacity && result.chosenLoanAmount > 0 && (
                <>
                  {" "}
                  Total repayable {formatCurrency(result.chosenTotalRepayable)} (principal +
                  interest).
                </>
              )}{" "}
              {DEMO_NOTICE}
            </p>
          </div>
      </CardContent>
    </Card>
  );
}

export function HomePageContent() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/60 bg-secondary/50">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-sm leading-6 text-foreground">
            <span className="font-semibold">Important:</span> {DEMO_NOTICE}
          </p>
        </div>
      </div>

      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <HomeBrandMark />
          <div className="hidden items-center gap-6 text-sm md:flex">
            <Link href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
              FAQ
            </Link>
          </div>
          <HomeHeaderActions />
        </div>
      </header>

      <section className="border-b border-border/60 bg-gradient-to-b from-secondary/40 via-background to-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:px-8 lg:py-24">
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit">
                Borrower-facing website demo
              </Badge>
              <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Show your lending business with a cleaner digital borrower journey.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Demo Client is a sample borrower-facing website for licensed money
                lenders exploring KPKT digital licence lending. It shows how your
                business could present a branded homepage, an upfront affordability
                preview, and a simple path into sign-up and application flows.
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/80 p-5">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 text-warning" aria-hidden />
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Disclaimer</p>
                  <p className="text-sm leading-6 text-muted-foreground">{DEMO_NOTICE}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                "Borrower-ready front page demo",
                `Illustrative ${ANNUAL_INTEREST_RATE}% p.a. affordability preview`,
                "Built for client walkthroughs",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-border/70 bg-background/80 px-4 py-5 text-sm text-muted-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <HomeLoanCalculator />
        </div>
      </section>

      <section id="how-it-works" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">How it works</Badge>
            <h2 className="font-heading text-3xl font-semibold">What your borrowers would see first</h2>
            <p className="text-muted-foreground">
              The homepage is structured to give licensed money lenders a simple example
              of how a digital borrower journey can start online.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ title, description, Icon }) => (
              <Card key={title} className="border-border/70">
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="space-y-2">
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Why this works for lenders</Badge>
            <h2 className="font-heading text-3xl font-semibold">
              Positioned for KPKT digital licence lending demos
            </h2>
            <p className="text-muted-foreground">
              The writing, structure, and borrower entry points are framed to help money
              lenders imagine how their own digital borrower experience could be presented.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {BENEFITS.map(({ title, description, Icon }) => (
              <Card key={title} className="border-border/70 bg-background">
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="space-y-2">
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">FAQ</Badge>
            <h2 className="font-heading text-3xl font-semibold">Questions lenders may ask</h2>
            <p className="text-muted-foreground">
              These answers clarify how the demo should be positioned during internal
              reviews, client walkthroughs, and product discussions.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-5">
              {FAQS.map((item) => (
                <Card key={item.question} className="border-border/70">
                  <CardHeader>
                    <CardTitle>{item.question}</CardTitle>
                    <CardDescription className="leading-7">{item.answer}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <Card className="border-border/70 bg-secondary/30">
              <CardHeader>
                <CardTitle>Want to explore the full borrower demo?</CardTitle>
                <CardDescription>
                  Continue into the demo sign-up flow to see how the borrower portal
                  experience extends beyond the homepage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button asChild className="w-full">
                  <Link href="/sign-up">Start demo sign-up flow</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/sign-in">Sign in to demo portal</Link>
                </Button>
                <p className="text-xs leading-6 text-muted-foreground">{DEMO_NOTICE}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-heading text-xl font-semibold">Demo Client</p>
              <p className="text-sm text-muted-foreground">KPKT digital lending demo</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link href="/legal/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/legal/security" className="transition-colors hover:text-foreground">
                Security
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-secondary/30 p-5">
            <p className="text-sm leading-6 text-muted-foreground">{DEMO_NOTICE}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
