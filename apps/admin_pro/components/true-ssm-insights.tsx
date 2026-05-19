"use client";

/**
 * Displays additional registry context surfaced by the latest TrueSSM™ pull
 * (officers, shareholders, charges, balance sheet, profit & loss, MSIC codes,
 * filing history). All data is read straight from `lastSsmPull.rawData` so the
 * page makes use of information we already have, even if the borrower record
 * itself was never asked to fill it during onboarding.
 *
 * When there is no pull yet, this card renders a subtle empty state with a
 * call-to-action that scrolls to the `<TrueSsmBox>` so the admin can pull.
 *
 * Raw response shape is documented in `apps/admin_pro/docs/TRUESSM_API.md`.
 */

import { useMemo } from "react";
import {
  Building2,
  Users,
  PieChart,
  Landmark,
  TrendingUp,
  ShieldCheck,
  ListTree,
  History,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency, formatDate, toSafeNumber } from "@/lib/utils";

/* --------------------------- public component API ------------------------- */

interface TrueSsmInsightsProps {
  /**
   * Raw provider response from the most recent successful pull
   * (`TrueSsmPull.rawData`). When null the card shows the empty-state CTA.
   */
  rawData: unknown;
  /**
   * When the user clicks the "Pull from TrueSSM™" CTA in the empty state.
   * Typically `() => trueSsmBoxRef.current?.scrollIntoView({ behavior: "smooth" })`.
   */
  onScrollToTrueSsmBox?: () => void;
  /**
   * Hide the CTA entirely (e.g. when the current user can't manage TrueSSM
   * pulls). When `true`, the empty state simply explains there's no data.
   */
  hideCta?: boolean;
  /**
   * When provided, the Officers tab shows a "Sync directors" banner with a
   * button that calls this handler. The parent owns the modal mount so the
   * same modal can also be triggered from elsewhere (e.g. the Company
   * Directors card on the borrower page).
   */
  onSyncDirectors?: () => void;
}

/* ------------------------------- code maps -------------------------------- */
// These mirror the maps in `pdfRenderer.ts` / `mapper.ts` so the UI decodes
// the same provider single-letter codes consistently.

const SSM_STATE_NAMES: Record<string, string> = {
  A: "Johor",
  B: "Selangor",
  C: "Pahang",
  D: "Kelantan",
  E: "Kedah",
  F: "Negeri Sembilan",
  G: "Pulau Pinang",
  H: "Sabah",
  J: "Perak",
  K: "Sarawak",
  L: "W.P. Labuan",
  M: "Melaka",
  N: "Perlis",
  P: "Terengganu",
  R: "W.P. Putrajaya",
  W: "W.P. Kuala Lumpur",
};

const SSM_OFFICER_DESIGNATION: Record<string, string> = {
  D: "Director",
  S: "Secretary",
  A: "Auditor",
  M: "Manager",
  O: "Officer",
};

const SSM_CHARGE_STATUS: Record<string, string> = {
  S: "Subsisting",
  R: "Released",
  U: "Discharged",
};

const SSM_CHARGE_MORTGAGE_TYPE: Record<string, string> = {
  A: "Assignment",
  F: "Fixed charge",
  O: "Other",
  D: "Debenture",
  L: "Legal",
};

const SSM_ID_TYPE: Record<string, string> = {
  MK: "MyKad",
  P: "Passport",
  C: "Company",
  X: "Other",
};

// Common SSM lodgement form codes — see `pdfRenderer.ts` for source list.
const SSM_FORM_DESCRIPTIONS: Record<string, string> = {
  "13": "Change of Name",
  "24": "Return of Allotment of Shares",
  "32A": "Transfer of Securities",
  "44": "Notice of Registered Office",
  "48A": "Statutory Declaration by Director",
  "49": "Return of Particulars of Directors / Officers",
  "557": "Annual Return",
  "9": "Certificate of Incorporation",
  AR: "Annual Return",
  BSC: "Balance Sheet / Accounts",
  PNA: "Notice of Annual General Meeting",
};

/* ------------------------------ value coercion ---------------------------- */

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
}

function readNestedList(
  source: unknown,
  outerKey: string,
  innerKey: string,
): Array<Record<string, unknown>> {
  const outer = asObject((source as Record<string, unknown>)?.[outerKey]);
  if (!outer) return [];
  const middle = asObject(outer[innerKey]);
  if (!middle) return [];
  return asArray(middle[innerKey]);
}

function plain(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function decode(map: Record<string, string>, v: unknown): string | null {
  const s = plain(v);
  if (!s) return null;
  return map[s.toUpperCase()] ?? s;
}

function formatMoney(value: unknown): string | null {
  const s = plain(value);
  if (!s) return null;
  const num = Number(s);
  if (!Number.isFinite(num)) return s;
  return formatCurrency(num);
}

/**
 * Accounting-style number formatting:
 *   - Negative values shown in parentheses (`(1,234.56)`) rather than with a
 *     leading minus sign, the standard convention for financial statements.
 *   - Two decimal places, comma grouping (`en-MY` locale).
 *   - Zero rendered as an em-dash to declutter the column (an accountant's
 *     trick — actual zero values are rare and usually meaningful when they do
 *     appear, so we still use a dash; values not present in the payload also
 *     end up as `null` → `—` in the grid).
 *   - Returns `null` when the input is missing/blank so the grid filter can
 *     skip the row.
 */
function formatAccounting(value: unknown): string | null {
  const s = plain(value);
  if (s === null) return null;
  const num = Number(s);
  if (!Number.isFinite(num)) return s;
  if (num === 0) return "—";
  const abs = Math.abs(num).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `(${abs})` : abs;
}

/**
 * The provider returns dates as ISO strings, sometimes with a UTC offset that
 * subtracts 8 hours from MYT (e.g. `1910-03-10T17:00:00.000Z` for an
 * incorporation date that should be read as `1910-03-10`). We avoid that
 * shift by slicing the UTC date portion before handing it to `formatDate`.
 */
function formatDateOnly(value: unknown): string | null {
  const s = plain(value);
  if (!s) return null;
  const datePart = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return s;
  try {
    return formatDate(datePart);
  } catch {
    return datePart;
  }
}

function formatAddressLines(block: Record<string, unknown> | null): string[] {
  if (!block) return [];
  const lines = [
    plain(block.address1),
    plain(block.address2),
    plain(block.address3),
    [plain(block.postcode), plain(block.town)].filter(Boolean).join(" ") || null,
    decode(SSM_STATE_NAMES, block.state),
  ].filter((x): x is string => !!x);
  return lines;
}

function sortByFinancialYearDesc<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ad = plain(a["financialYearEndDate"]) ?? "";
    const bd = plain(b["financialYearEndDate"]) ?? "";
    return bd.localeCompare(ad);
  });
}

/* --------------------------- shared sub-components ------------------------ */

function EmptyTab({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground italic px-1 py-6 text-center">
      {message}
    </p>
  );
}

interface KvRow {
  label: string;
  value: string | null;
}

function KvGrid({ rows }: { rows: KvRow[] }) {
  const entries = rows.filter((r) => r.value !== null && r.value !== "");
  if (entries.length === 0) {
    return <EmptyTab message="No data in this section." />;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {entries.map((e) => (
        <div key={e.label}>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {e.label}
          </dt>
          <dd className="text-sm font-medium break-words">{e.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Two-column financial statement layout: each row has the label on the left
 * and the value right-aligned with tabular-num figures so digits line up
 * across rows. Negative values (rendered as `(1,234.56)` by
 * `formatAccounting`) are highlighted in rose to stand out from positives.
 */
function AccountingGrid({ rows }: { rows: KvRow[] }) {
  const entries = rows.filter((r) => r.value !== null && r.value !== "");
  if (entries.length === 0) {
    return <EmptyTab message="No data in this section." />;
  }
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0.5">
      {entries.map((e) => {
        const isNegative = typeof e.value === "string" && e.value.startsWith("(");
        return (
          <div
            key={e.label}
            className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1.5"
          >
            <dt className="text-xs text-muted-foreground">{e.label}</dt>
            <dd
              className={cn(
                "text-sm font-mono tabular-nums tracking-tight text-right shrink-0",
                isNegative
                  ? "text-rose-700 dark:text-rose-400 font-medium"
                  : "font-medium",
              )}
            >
              {e.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/* --------------------------------- main ----------------------------------- */

export function TrueSsmInsights({
  rawData,
  onScrollToTrueSsmBox,
  hideCta,
  onSyncDirectors,
}: TrueSsmInsightsProps) {
  const parsed = useMemo(() => parseSsmPayload(rawData), [rawData]);

  // Officer rows with `designationCode === "D"` are the only ones eligible for
  // director sync. We pre-compute the count here so the banner can show it.
  const directorCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.officers.filter(
      (o) => (typeof o["designationCode"] === "string" ? o["designationCode"].toUpperCase() : "") === "D",
    ).length;
  }, [parsed]);

  const canShowSyncDirectors = !!onSyncDirectors && directorCount > 0;

  // No pull yet — render dashed empty state with optional CTA.
  if (!parsed) {
    return (
      <Card className="border-dashed border-emerald-500/30 bg-emerald-500/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            TrueSSM&trade; Registry Insights
          </CardTitle>
          <CardDescription>
            Officers, shareholders, charges, financials and filing history pulled
            from the official SSM registry will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
            <p>
              No TrueSSM&trade; report has been pulled for this borrower yet.
              {!hideCta
                ? " Pull a company profile to populate this section without re-keying any data."
                : null}
            </p>
            {!hideCta && onScrollToTrueSsmBox ? (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                onClick={onScrollToTrueSsmBox}
              >
                <ArrowDownRight className="h-4 w-4 mr-1.5" />
                Pull from TrueSSM&trade;
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    officers,
    shareholders,
    charges,
    balanceSheets,
    profitLoss,
    businessCodes,
    documentLodge,
    latestBalanceSheet,
    latestProfitLoss,
    auditFirm,
  } = parsed;

  // Hide tabs that have nothing to show.
  const tabSpecs = [
    { id: "officers", label: "Officers", count: officers.length, icon: Users },
    { id: "shareholders", label: "Shareholders", count: shareholders.length, icon: PieChart },
    { id: "charges", label: "Charges", count: charges.length, icon: Landmark },
    {
      id: "financials",
      label: "Financials",
      count: balanceSheets.length + profitLoss.length,
      icon: TrendingUp,
    },
    { id: "auditor", label: "Auditor", count: auditFirm ? 1 : 0, icon: ShieldCheck },
    { id: "activities", label: "Activities", count: businessCodes.length, icon: ListTree },
    { id: "filings", label: "Filings", count: documentLodge.length, icon: History },
  ];
  const visibleTabs = tabSpecs.filter((t) => t.count > 0);

  if (visibleTabs.length === 0) {
    return (
      <Card className="border-emerald-500/15 bg-emerald-500/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-700 dark:text-emerald-500" />
            TrueSSM&trade; Registry Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyTab message="The latest pull did not include any additional registry data." />
        </CardContent>
      </Card>
    );
  }

  const defaultTab = visibleTabs[0].id;

  return (
    <Card className="border-emerald-500/15 bg-emerald-500/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-700 dark:text-emerald-500" />
              TrueSSM&trade; Registry Insights
            </CardTitle>
            <CardDescription>
              Additional company data pulled from the official SSM registry.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shrink-0"
          >
            From TrueSSM&trade;
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-3 justify-start">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-none border border-transparent data-[state=active]:border-emerald-500/30 text-xs gap-1.5 px-2.5 py-1.5 h-auto"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  <span className="text-[10px] opacity-70">{t.count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* ---- Officers ---- */}
          {officers.length > 0 && (
            <TabsContent value="officers" className="mt-0 space-y-3">
              {canShowSyncDirectors && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      Sync directors to borrower
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reconcile this borrower&apos;s director roster against the{" "}
                      <span className="font-medium">
                        {directorCount} director{directorCount === 1 ? "" : "s"}
                      </span>{" "}
                      reported by SSM. Add, update or verify in one step.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSyncDirectors?.()}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync directors
                  </button>
                </div>
              )}
              {officers.map((o, idx) => {
                const addr = formatAddressLines(o);
                const designation = decode(SSM_OFFICER_DESIGNATION, o.designationCode);
                const idLabel = decode(SSM_ID_TYPE, o.idType);
                return (
                  <div
                    key={`${plain(o.name) ?? "officer"}-${idx}`}
                    className="rounded-md border border-emerald-500/10 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {plain(o.name) ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            plain(o.idNo)
                              ? `${idLabel ?? "ID"} ${plain(o.idNo)}`
                              : null,
                            formatDateOnly(o.startDate)
                              ? `Since ${formatDateOnly(o.startDate)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || null}
                        </p>
                      </div>
                      {designation ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] shrink-0"
                        >
                          {designation}
                        </Badge>
                      ) : null}
                    </div>
                    {addr.length > 0 ? (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {addr.join(", ")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </TabsContent>
          )}

          {/* ---- Shareholders ---- */}
          {shareholders.length > 0 && (
            <TabsContent value="shareholders" className="mt-0 space-y-3">
              <ShareholdersList shareholders={shareholders} />
            </TabsContent>
          )}

          {/* ---- Charges ---- */}
          {charges.length > 0 && (
            <TabsContent value="charges" className="mt-0">
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <th className="text-left font-medium px-2 py-2">No</th>
                      <th className="text-right font-medium px-2 py-2">Amount</th>
                      <th className="text-left font-medium px-2 py-2">Type</th>
                      <th className="text-left font-medium px-2 py-2">Status</th>
                      <th className="text-left font-medium px-2 py-2">Chargee</th>
                      <th className="text-left font-medium px-2 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((c, idx) => {
                      const status = decode(SSM_CHARGE_STATUS, c.chargeStatus);
                      return (
                        <tr
                          key={`${plain(c.chargeNo) ?? idx}-${idx}`}
                          className="border-b border-border/40 last:border-b-0"
                        >
                          <td className="px-2 py-2 align-top">
                            {plain(c.chargeNo) ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-top text-right font-mono">
                            {formatMoney(c.chargeAmount) ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {decode(SSM_CHARGE_MORTGAGE_TYPE, c.chargeMortgageType) ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {status ? (
                              <Badge
                                variant="outline"
                                className={
                                  status === "Subsisting"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px]"
                                    : "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 text-[10px]"
                                }
                              >
                                {status}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 align-top break-words max-w-[200px]">
                            {plain(c.chargeeName) ?? plain(c.chargeeId) ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-top whitespace-nowrap">
                            {formatDateOnly(c.chargeCreateDate) ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}

          {/* ---- Financials (Balance sheet + P&L) ---- */}
          {(balanceSheets.length > 0 || profitLoss.length > 0) && (
            <TabsContent value="financials" className="mt-0 space-y-5">
              {latestBalanceSheet ? (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Landmark className="h-4 w-4 text-emerald-700 dark:text-emerald-500" />
                      Balance Sheet
                    </h4>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Latest filing ·{" "}
                      {formatDateOnly(latestBalanceSheet["financialYearEndDate"]) ?? "—"}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    All values in RM · figures in (parentheses) are negative
                  </p>
                  <AccountingGrid
                    rows={[
                      {
                        label: "Current Assets",
                        value: formatAccounting(latestBalanceSheet["currentAsset"]),
                      },
                      {
                        label: "Fixed Assets",
                        value: formatAccounting(latestBalanceSheet["fixedAsset"]),
                      },
                      {
                        label: "Liabilities",
                        value: formatAccounting(latestBalanceSheet["liability"]),
                      },
                      {
                        label: "Long-Term Liab.",
                        value: formatAccounting(latestBalanceSheet["longTermLiability"]),
                      },
                      {
                        label: "Paid-up Capital",
                        value: formatAccounting(latestBalanceSheet["paidUpCapital"]),
                      },
                      {
                        label: "Reserves",
                        value: formatAccounting(latestBalanceSheet["reserves"]),
                      },
                      {
                        label: "Retained Earnings",
                        value: formatAccounting(latestBalanceSheet["inappropriateProfit"]),
                      },
                      {
                        label: "Contingent Liab.",
                        // Provider typo (`contigent`) — preserved verbatim.
                        value: formatAccounting(latestBalanceSheet["contigentLiability"]),
                      },
                    ]}
                  />
                </section>
              ) : null}

              {balanceSheets.length > 0 && latestProfitLoss ? (
                <Separator className="bg-emerald-500/15" />
              ) : null}

              {latestProfitLoss ? (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-500" />
                      Profit &amp; Loss
                    </h4>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Latest filing ·{" "}
                      {formatDateOnly(latestProfitLoss["financialYearEndDate"]) ?? "—"}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    All values in RM · figures in (parentheses) are negative
                  </p>
                  <AccountingGrid
                    rows={[
                      { label: "Turnover", value: formatAccounting(latestProfitLoss["turnover"]) },
                      { label: "Revenue", value: formatAccounting(latestProfitLoss["revenue"]) },
                      {
                        label: "Total Revenue",
                        value: formatAccounting(latestProfitLoss["totalRevenue"]),
                      },
                      {
                        label: "Total Income",
                        value: formatAccounting(latestProfitLoss["totalIncome"]),
                      },
                      {
                        label: "Total Expenditure",
                        value: formatAccounting(latestProfitLoss["totalExpenditure"]),
                      },
                      {
                        label: "Profit Before Tax",
                        value: formatAccounting(latestProfitLoss["profitBeforeTax"]),
                      },
                      {
                        label: "Profit After Tax",
                        value: formatAccounting(latestProfitLoss["profitAfterTax"]),
                      },
                      {
                        label: "Net Dividend",
                        value: formatAccounting(latestProfitLoss["netDividend"]),
                      },
                    ]}
                  />
                </section>
              ) : null}

              {(balanceSheets.length > 1 || profitLoss.length > 1) ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Full multi-year history is included in the generated PDF report.
                </p>
              ) : null}
            </TabsContent>
          )}

          {/* ---- Auditor ---- */}
          {auditFirm ? (
            <TabsContent value="auditor" className="mt-0">
              <KvGrid
                rows={[
                  { label: "Audit Firm", value: auditFirm.name },
                  { label: "Audit Firm No.", value: auditFirm.firmNo },
                  { label: "Reporting Year", value: auditFirm.reportingYear },
                  {
                    label: "Address",
                    value: auditFirm.address.length
                      ? auditFirm.address.join(", ")
                      : null,
                  },
                ]}
              />
            </TabsContent>
          ) : null}

          {/* ---- Activities (MSIC) ---- */}
          {businessCodes.length > 0 && (
            <TabsContent value="activities" className="mt-0 space-y-2">
              {businessCodes
                .slice()
                .sort((a, b) => {
                  const ap = Number(plain(a["priority"]) ?? "99");
                  const bp = Number(plain(b["priority"]) ?? "99");
                  return (Number.isFinite(ap) ? ap : 99) - (Number.isFinite(bp) ? bp : 99);
                })
                .map((c, idx) => (
                  <div
                    key={`${plain(c["businessCode"]) ?? idx}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/10 bg-background/60 px-3 py-2 text-sm"
                  >
                    <code className="font-mono text-xs font-semibold">
                      MSIC {plain(c["businessCode"]) ?? "—"}
                    </code>
                    <Badge
                      variant="outline"
                      className={
                        plain(c["priority"]) === "1"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                          : "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 text-[10px]"
                      }
                    >
                      {plain(c["priority"]) === "1"
                        ? "Primary"
                        : `Secondary ${plain(c["priority"]) ?? ""}`.trim()}
                    </Badge>
                  </div>
                ))}
            </TabsContent>
          )}

          {/* ---- Filings ---- */}
          {documentLodge.length > 0 && (
            <TabsContent value="filings" className="mt-0">
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <th className="text-left font-medium px-2 py-2">Date</th>
                      <th className="text-left font-medium px-2 py-2">Form</th>
                      <th className="text-left font-medium px-2 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...documentLodge]
                      .sort((a, b) => {
                        const ad = plain(a["documentDate"]) ?? "";
                        const bd = plain(b["documentDate"]) ?? "";
                        return bd.localeCompare(ad);
                      })
                      .map((d, idx) => {
                        const form = plain(d["formTrx"]);
                        const desc =
                          form && SSM_FORM_DESCRIPTIONS[form.toUpperCase()]
                            ? SSM_FORM_DESCRIPTIONS[form.toUpperCase()]
                            : "—";
                        return (
                          <tr
                            key={`${form ?? idx}-${idx}`}
                            className="border-b border-border/40 last:border-b-0"
                          >
                            <td className="px-2 py-2 whitespace-nowrap">
                              {formatDateOnly(d["documentDate"]) ?? "—"}
                            </td>
                            <td className="px-2 py-2 font-mono">{form ?? "—"}</td>
                            <td className="px-2 py-2 text-muted-foreground">{desc}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* --------------------------- shareholders helper -------------------------- */

function ShareholdersList({
  shareholders,
}: {
  shareholders: Array<Record<string, unknown>>;
}) {
  // Compute % of total shareholding if all entries have a numeric `share`.
  const numericShares = shareholders.map((h) => toSafeNumber(plain(h.share) ?? null));
  const totalShares = numericShares.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  const showPercent = totalShares > 0;

  return (
    <ul className="space-y-2">
      {shareholders.map((h, idx) => {
        const idLabel = decode(SSM_ID_TYPE, h.idType);
        const idNo = plain(h.idNo);
        const shares = numericShares[idx];
        const pct =
          showPercent && Number.isFinite(shares) && totalShares > 0
            ? ((shares / totalShares) * 100).toFixed(2)
            : null;
        return (
          <li
            key={`${plain(h.name) ?? "shareholder"}-${idx}`}
            className="rounded-md border border-emerald-500/10 bg-background/60 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{plain(h.name) ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {[idLabel, idNo && idNo !== "-" ? idNo : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-mono font-medium">
                  {formatMoney(h.share) ?? "—"}
                </p>
                {pct ? (
                  <p className="text-[10px] text-muted-foreground">{pct}%</p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ payload parsing --------------------------- */

interface ParsedSsm {
  officers: Array<Record<string, unknown>>;
  shareholders: Array<Record<string, unknown>>;
  charges: Array<Record<string, unknown>>;
  balanceSheets: Array<Record<string, unknown>>;
  profitLoss: Array<Record<string, unknown>>;
  businessCodes: Array<Record<string, unknown>>;
  documentLodge: Array<Record<string, unknown>>;
  latestBalanceSheet: Record<string, unknown> | null;
  latestProfitLoss: Record<string, unknown> | null;
  auditFirm: {
    name: string;
    firmNo: string | null;
    reportingYear: string | null;
    address: string[];
  } | null;
}

function parseSsmPayload(rawData: unknown): ParsedSsm | null {
  if (!rawData) return null;
  const root = asObject(rawData);
  if (!root) return null;
  const compProfile = asObject(root["getCompProfile"]) ?? root;

  const officers = readNestedList(
    compProfile,
    "rocCompanyOfficerListInfo",
    "rocCompanyOfficerInfos",
  );
  const shareholders = readNestedList(
    compProfile,
    "rocShareholderListInfo",
    "rocShareholderInfos",
  );
  const charges = readNestedList(compProfile, "rocChargesListInfo", "rocChargesInfos");
  const balanceSheets = sortByFinancialYearDesc(
    readNestedList(compProfile, "rocBalanceSheetListInfo", "rocBalanceSheetInfos"),
  );
  const profitLoss = sortByFinancialYearDesc(
    readNestedList(compProfile, "rocProfitLossListInfo", "rocProfitLossInfos"),
  );
  const businessCodes = readNestedList(
    compProfile,
    "rocBusinessCodeListInfo",
    "rocBusinessCodeInfos",
  );
  const documentLodge = readNestedList(
    compProfile,
    "rocDocumentLodgeListInfo",
    "rocDocumentLodgeInfos",
  );

  const latestBalanceSheet = balanceSheets[0] ?? null;
  const latestProfitLoss = profitLoss[0] ?? null;

  const auditFirmName =
    latestBalanceSheet ? plain(latestBalanceSheet["auditFirmName"]) : null;
  const auditFirm = auditFirmName
    ? {
        name: auditFirmName,
        firmNo: plain(latestBalanceSheet!["auditFirmNo"]),
        reportingYear: formatDateOnly(latestBalanceSheet!["financialYearEndDate"]),
        address: formatAddressLines({
          address1: latestBalanceSheet!["auditFirmAddress1"],
          address2: latestBalanceSheet!["auditFirmAddress2"],
          address3: latestBalanceSheet!["auditFirmAddress3"],
          postcode: latestBalanceSheet!["auditFirmPostcode"],
          state: latestBalanceSheet!["auditFirmState"],
          town: latestBalanceSheet!["auditFirmTown"],
        }),
      }
    : null;

  // If absolutely nothing came back, treat as "no pull" so callers can show
  // the dashed empty state instead of an empty Insights card.
  const totalRows =
    officers.length +
    shareholders.length +
    charges.length +
    balanceSheets.length +
    profitLoss.length +
    businessCodes.length +
    documentLodge.length;
  if (totalRows === 0) return null;

  return {
    officers,
    shareholders,
    charges,
    balanceSheets,
    profitLoss,
    businessCodes,
    documentLodge,
    latestBalanceSheet,
    latestProfitLoss,
    auditFirm,
  };
}
