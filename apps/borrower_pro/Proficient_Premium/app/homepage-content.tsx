"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";
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

// TODO: replace placeholder copy + branding with the final Proficient Premium content.
const LENDER_NAME = "Proficient Premium";
const ANNUAL_INTEREST_RATE = 18;
const AFFORDABILITY_FACTOR = 0.8;
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
    title: "Choose your loan",
    description:
      "Pick your loan term, share your income and existing commitments to see what you can borrow.",
    Icon: Calculator,
  },
  {
    title: "Submit your application",
    description:
      "Complete a guided online application. We will get in touch to confirm next steps.",
    Icon: Wallet,
  },
  {
    title: "Get a decision",
    description:
      "Once approved, manage your loan, repayments, and documents in your borrower portal.",
    Icon: CheckCircle2,
  },
] as const;

const BENEFITS = [
  {
    title: "Licensed and regulated",
    description: `${LENDER_NAME} operates as a licensed money lender in Malaysia.`,
    Icon: ShieldCheck,
  },
  {
    title: "Fast online application",
    description:
      "Apply online and track your application status in your secure borrower account.",
    Icon: Clock3,
  },
  {
    title: "Clear terms",
    description:
      "Indicative figures up front, full terms in your loan documents before you sign.",
    Icon: FileText,
  },
] as const;

function HomeBrandMark() {
  return (
    <Link
      href="/"
      className="flex items-center"
      aria-label={`${LENDER_NAME} home`}
    >
      <span className="font-heading text-xl font-semibold text-foreground">
        {LENDER_NAME}
      </span>
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
      maxLoanAmount,
      chosenLoanAmount,
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
    <Card id="loan-calculator" className="border-border/70 bg-card/95 shadow-lg">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Loan estimate</Badge>
          <Badge variant="outline">{ANNUAL_INTEREST_RATE}% p.a. example</Badge>
        </div>
        <div>
          <CardTitle className="text-2xl sm:text-3xl">How much can I borrow?</CardTitle>
          <CardDescription className="mt-2">
            Enter your income and commitments to see an indicative monthly repayment. Final
            figures are confirmed after assessment.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="current-commitments">Current monthly commitments (RM)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="More information about commitments"
                  >
                    <CircleHelp className="h-4 w-4" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Include other loans (e.g. car, home), rent, and recurring obligations.</p>
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
              {result.canAssess ? (
                <CircleAlert className="mt-0.5 h-5 w-5 text-error" aria-hidden />
              ) : (
                <Calculator className="mt-0.5 h-5 w-5 text-foreground" aria-hidden />
              )}
              <p className="font-medium text-foreground">
                {!result.canAssess
                  ? "Add your monthly income to see an estimate."
                  : result.remainingAfterCommitments < 0
                    ? `Commitments exceed affordability by ${formatCurrency(affordabilityShortfall)}`
                    : "Try a higher income or lower commitments to see an estimate."}
              </p>
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
                {" "}/ {formatCurrency(result.maxLoanAmount)} max
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
          />
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

        <Button asChild size="lg" className="w-full" disabled={result.remainingAfterCommitments < 0}>
          <Link href="/sign-up">
            Apply now
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>

        <p className="text-xs leading-6 text-muted-foreground">
          Indicative figures only. Final loan terms are confirmed after assessment and will be
          set out in your loan documentation.
        </p>
      </CardContent>
    </Card>
  );
}

export function HomePageContent() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <HomeBrandMark />
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <HomeHeaderActions />
          </div>
        </div>
      </header>

      <section className="border-b border-border/60 bg-gradient-to-b from-secondary/40 via-background to-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:px-8 lg:py-24">
          <div className="space-y-8">
            <Badge variant="outline" className="w-fit">Borrower portal</Badge>
            <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Borrow with {LENDER_NAME}.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Apply online, track your application, and manage repayments from one secure
              borrower portal.
            </p>
          </div>
          <HomeLoanCalculator />
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">How it works</Badge>
            <h2 className="font-heading text-3xl font-semibold">Three simple steps</h2>
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

      <section className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Why {LENDER_NAME}</Badge>
            <h2 className="font-heading text-3xl font-semibold">Built around your borrower experience</h2>
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

      <footer className="border-t border-border/60 bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="font-heading font-semibold text-foreground">
                {LENDER_NAME.toUpperCase()} SDN. BHD.
              </p>
              <p className="text-sm text-muted-foreground">
                {/* TODO: replace with the registered business address and license details. */}
                Registered business address — to be added.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link href="/legal/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <Link href="/legal/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <Link href="/legal/security" className="transition-colors hover:text-foreground">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
