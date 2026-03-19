"use client";

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { formatRelativeTime } from "../../lib/format-relative-time";
import {
  getPerformanceBadgeMeta,
  getConsistencyMeta,
  formatLoanStatusLabel,
  getCrossTenantLoanItems,
  getCrossTenantLoanLenderName,
  getCrossTenantLoanAmountRange,
  getPaymentPerformanceBadgeVariant,
  type CrossTenantInsightsData,
} from "../../lib/truesight-helpers";

interface TrueSightPanelProps {
  borrowerType: "INDIVIDUAL" | "CORPORATE";
  isIC: boolean;
  identifier: string;
  lookupReady: boolean;
  insights: CrossTenantInsightsData | null;
  loading: boolean;
  nameReady: boolean;
  phoneReady: boolean;
  addressInput: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postcode: string;
  };
}

export function TrueSightPanel({
  borrowerType,
  isIC,
  identifier,
  lookupReady,
  insights,
  loading,
  nameReady,
  phoneReady,
  addressInput,
}: TrueSightPanelProps) {
  if (!lookupReady) {
    return (
      <Card className="border-primary/60 shadow-[0_0_25px_hsl(var(--primary)_/_0.35)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            TrueSight™
          </CardTitle>
          <CardDescription>
            Borrowing history insights from other lenders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
            <p className="text-sm text-muted-foreground">
              {borrowerType === "INDIVIDUAL"
                ? isIC
                  ? "Enter a complete 12-digit IC number to preview TrueSight data."
                  : "TrueSight preview is available for IC numbers only."
                : "Enter the SSM registration number to preview TrueSight data."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-primary/60 shadow-[0_0_25px_hsl(var(--primary)_/_0.35)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            TrueSight™
          </CardTitle>
          <CardDescription>
            Borrowing history insights from other lenders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-12 w-full rounded-lg bg-muted" />
            <div className="h-4 w-4/5 rounded bg-muted" />
            <div className="h-4 w-3/5 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card className="border-primary/60 shadow-[0_0_25px_hsl(var(--primary)_/_0.35)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            TrueSight™
          </CardTitle>
          <CardDescription>
            Borrowing history insights from other lenders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load TrueSight data right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!insights.hasHistory) {
    return (
      <Card className="border-primary/60 shadow-[0_0_25px_hsl(var(--primary)_/_0.35)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            TrueSight™
          </CardTitle>
          <CardDescription>
            Borrowing history insights from other lenders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-sm font-medium">No borrowing history with other lenders</p>
            <p className="text-xs text-muted-foreground mt-1">
              We could not find disbursed loans for this identifier with other lenders.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ratingMeta = getPerformanceBadgeMeta(insights.paymentPerformance.rating);
  const crossTenantLoanItems = getCrossTenantLoanItems(insights);
  const visibleCrossTenantLoanItems = crossTenantLoanItems.slice(0, 5);
  const hasAddressInput =
    addressInput.addressLine1.length > 0 ||
    addressInput.addressLine2.length > 0 ||
    addressInput.city.length > 0 ||
    addressInput.state.length > 0 ||
    addressInput.postcode.length > 0;

  return (
    <Card className="border-primary/60 shadow-[0_0_25px_hsl(var(--primary)_/_0.35)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          TrueSight™
        </CardTitle>
        <CardDescription>
          Borrowing history insights from other lenders
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-sm font-medium">
              Borrowed from {insights.otherLenderCount} other lender
              {insights.otherLenderCount === 1 ? "" : "s"}
            </p>
            {insights.lenderNames.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Lenders: {insights.lenderNames.join(", ")}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
              Data consistency with other lenders
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">Name: </span>
                {!nameReady ? (
                  <span className="text-muted-foreground">Awaiting input</span>
                ) : (
                  <Badge
                    variant={getConsistencyMeta(insights.nameConsistency).variant}
                    className="text-xs"
                  >
                    {getConsistencyMeta(insights.nameConsistency).label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">Phone (exact): </span>
                {!phoneReady ? (
                  <span className="text-muted-foreground">Awaiting input</span>
                ) : (
                  <Badge
                    variant={getConsistencyMeta(insights.phoneConsistency).variant}
                    className="text-xs"
                  >
                    {getConsistencyMeta(insights.phoneConsistency).label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">Address: </span>
                {!hasAddressInput ? (
                  <span className="text-muted-foreground">Awaiting input</span>
                ) : (
                  <Badge
                    variant={getConsistencyMeta(insights.addressConsistency).variant}
                    className="text-xs"
                  >
                    {getConsistencyMeta(insights.addressConsistency).label}
                  </Badge>
                )}
              </div>
              {(getConsistencyMeta(insights.nameConsistency).showAlert ||
                getConsistencyMeta(insights.phoneConsistency).showAlert ||
                getConsistencyMeta(insights.addressConsistency).showAlert) && (
                <p className="text-xs text-muted-foreground mt-2">
                  Name and address allow partial/almost-full matching. Phone requires an exact
                  match. Verify if needed.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border px-3 py-2.5 space-y-1.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Total Borrowed Range
            </p>
            <p className="text-sm font-medium">
              {insights.totalBorrowedRange ?? "Not available"}
            </p>
          </div>

          <div className="rounded-lg border border-border px-3 py-2.5 space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Overall risk (all-time)
            </p>
            <p className="text-xs text-muted-foreground">
              Includes defaults and late payments across all matched loans. Recent behaviour may
              differ.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={ratingMeta.variant}>{ratingMeta.label}</Badge>
              {insights.paymentPerformance.onTimeRateRange && (
                <span className="text-xs text-muted-foreground">
                  On-time {insights.paymentPerformance.onTimeRateRange} (all loans)
                </span>
              )}
            </div>
          </div>

          <p className="text-sm">
            <span className="font-medium tabular-nums">{insights.activeLoans}</span>
            <span className="text-muted-foreground"> Active</span>
            <span className="text-muted-foreground/60 mx-2">·</span>
            <span className="font-medium tabular-nums text-success">
              {insights.completedLoans}
            </span>
            <span className="text-muted-foreground"> Completed</span>
            <span className="text-muted-foreground/60 mx-2">·</span>
            <span className="font-medium tabular-nums text-error">
              {insights.defaultedLoans}
            </span>
            <span className="text-muted-foreground"> Defaulted</span>
            <span className="text-muted-foreground/60 mx-2">·</span>
            <span className="font-medium tabular-nums">
              {insights.latePaymentsCount ?? 0}
            </span>
            <span className="text-muted-foreground"> Late</span>
          </p>

          {visibleCrossTenantLoanItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Latest loans across other lenders
                </p>
                {crossTenantLoanItems.length > visibleCrossTenantLoanItems.length && (
                  <p className="text-xs text-muted-foreground">
                    Showing latest {visibleCrossTenantLoanItems.length} of{" "}
                    {crossTenantLoanItems.length}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-2">Lender</TableHead>
                      <TableHead className="text-[10px] py-2">Status</TableHead>
                      <TableHead className="text-[10px] py-2">Borrowed</TableHead>
                      <TableHead className="text-[10px] py-2">Amount</TableHead>
                      <TableHead className="text-[10px] py-2">On-time (this loan)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCrossTenantLoanItems.map((loan, index) => {
                      const loanDate =
                        loan.disbursementDate ??
                        loan.agreementDate ??
                        loan.createdAt ??
                        loan.updatedAt;
                      const statusLabel = formatLoanStatusLabel(loan.status);

                      return (
                        <TableRow
                          key={
                            loan.id ??
                            `${getCrossTenantLoanLenderName(loan)}-${loanDate ?? "unknown"}-${index}`
                          }
                          className="text-xs"
                        >
                          <TableCell className="py-2 font-medium text-xs">
                            {getCrossTenantLoanLenderName(loan)}
                          </TableCell>
                          <TableCell className="py-2">
                            {statusLabel ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {statusLabel}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {loanDate ? formatRelativeTime(loanDate) : "-"}
                          </TableCell>
                          <TableCell className="py-2 text-xs">
                            {getCrossTenantLoanAmountRange(loan) ?? "-"}
                          </TableCell>
                          <TableCell className="py-2">
                            {loan.paymentPerformance?.onTimeRateRange ? (
                              <Badge
                                variant={getPaymentPerformanceBadgeVariant(
                                  loan.paymentPerformance.onTimeRateRange
                                )}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {loan.paymentPerformance.onTimeRateRange}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                -
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              {insights.lastBorrowedAt
                ? `Last borrowed ${formatRelativeTime(insights.lastBorrowedAt)}`
                : "No agreement date found on matched loans"}
            </p>
            <p>
              {insights.lastActivityAt
                ? `Last payment ${formatRelativeTime(insights.lastActivityAt)}`
                : "No recent payment activity"}
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-border px-3 py-2.5 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground/80">Match criteria:</strong> Borrowers matched by{" "}
              {borrowerType === "CORPORATE" ? "SSM" : "IC"} number only.
            </p>
            <p className="text-xs text-muted-foreground">
              Data is aggregated across the platform. Loan amounts remain bucketed into ranges,
              and TrueSight may show only the latest 5 matched loans.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
