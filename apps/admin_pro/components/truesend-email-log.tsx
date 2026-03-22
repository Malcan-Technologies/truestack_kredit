"use client";

import { useEffect, useState, useCallback } from "react";
import { Send, RefreshCw, Mail, Clock, ChevronDown, Sparkles, Paperclip } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { formatSmartDateTime } from "@/lib/utils";
import { TrueSendStatusBadge } from "@/components/truesend-badge";

// ============================================
// Types
// ============================================

interface EmailLogEntry {
  id: string;
  emailType: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: string;
  attachmentPath: string | null;
  failureReason: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  resentAt: string | null;
  resentCount: number;
  createdAt: string;
}

interface TrueSendEmailLogProps {
  loanId: string;
  /** Increment this to trigger a refresh from the parent (e.g. after a payment is recorded) */
  refreshKey?: number;
}

// ============================================
// Email type label mapping
// ============================================

const EMAIL_TYPE_LABELS: Record<string, string> = {
  PAYMENT_REMINDER: "Payment Reminder",
  PAYMENT_RECEIPT: "Payment Receipt",
  LATE_PAYMENT: "Late Payment Notice",
  ARREARS_NOTICE: "Arrears Notice",
  DEFAULT_NOTICE: "Default Notice",
  DISBURSEMENT: "Disbursement",
  COMPLETION: "Discharge Letter",
};

/** Number of emails to show initially and per "Load More" click */
const PAGE_SIZE = 3;

// ============================================
// Component
// ============================================

export function TrueSendEmailLog({ loanId, refreshKey }: TrueSendEmailLogProps) {
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [trueSendActive, setTrueSendActive] = useState<boolean | null>(null); // null = loading

  const fetchEmails = useCallback(async () => {
    try {
      const res = await api.get<EmailLogEntry[]>(
        `/api/loans/${loanId}/email-logs`
      );
      if (res.success && res.data) {
        setEmails(res.data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  // Fetch add-on status
  useEffect(() => {
    const checkAddOn = async () => {
      try {
        const res = await api.get<{
          addOns: Array<{ addOnType: string; status: string }>;
        }>("/api/billing/add-ons");
        if (res.success && res.data) {
          const active = res.data.addOns.some(
            (a) => a.addOnType === "TRUESEND" && a.status === "ACTIVE"
          );
          setTrueSendActive(active);
        } else {
          setTrueSendActive(false);
        }
      } catch {
        setTrueSendActive(false);
      }
    };
    checkAddOn();
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Refresh when refreshKey changes (parent triggered, e.g. after payment)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchEmails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleManualRefresh = async () => {
    await fetchEmails();
    toast.success("Email log refreshed");
  };

  const handleResend = async (emailLogId: string) => {
    setResending(emailLogId);
    try {
      const res = await api.post<{ message: string }>(
        `/api/notifications/truesend/${emailLogId}/resend`,
        {}
      );
      if (res.success) {
        toast.success(res.data?.message || "Email resent successfully");
        fetchEmails();
      } else {
        toast.error(res.error || "Failed to resend email");
      }
    } catch {
      toast.error("Failed to resend email");
    } finally {
      setResending(null);
    }
  };

  // Check if resend is possible for a given email
  const canResend = (email: EmailLogEntry): boolean => {
    const resendableStatuses = ["failed", "bounced", "complained"];
    if (!resendableStatuses.includes(email.status)) return false;

    // Check 1x per day limit (simple check — server enforces properly)
    if (email.resentAt) {
      const lastResent = new Date(email.resentAt);
      const now = new Date();
      const isSameDay =
        lastResent.toISOString().split("T")[0] ===
        now.toISOString().split("T")[0];
      if (isSameDay) return false;
    }

    return true;
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  };

  const isInactive = trueSendActive === false;
  const visibleEmails = emails.slice(0, visibleCount);
  const hasMore = emails.length > visibleCount;

  return (
    <TooltipProvider>
      <Card className={isInactive ? "opacity-50 border-dashed border-muted-foreground/30" : "bg-purple-500/[0.04] border-purple-500/15"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Send className={`h-5 w-5 ${isInactive ? "text-muted-foreground" : "text-purple-500"}`} />
              TrueSend™
            </CardTitle>
            {!isInactive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManualRefresh}
                className="h-8"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <CardDescription className="mt-0.5">
            Automatically delivers receipts, reminders, and notices to borrowers by email.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Inactive / not subscribed state */}
          {isInactive ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <Send className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Automated emails are not enabled
              </p>
              <p className="text-xs text-muted-foreground/70 max-w-[280px] mb-4">
                Enable the TrueSend add-on from your plan settings to automatically send payment receipts, reminders, arrears notices, and more to your borrowers.
              </p>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/dashboard/settings">
                  <Sparkles className="h-3.5 w-3.5" />
                  Update plan
                </Link>
              </Button>
            </div>
          ) : loading || trueSendActive === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Loading email history...
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Mail className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No emails sent for this loan yet</p>
              <p className="text-xs mt-1 opacity-70">
                Emails will appear here as loan events occur
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleEmails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  {/* Left: type + time */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {EMAIL_TYPE_LABELS[email.emailType] || email.emailType}
                      </span>
                      {email.attachmentPath && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Includes attachment</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {email.resentCount > 0 && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          (resent {email.resentCount}x)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {email.sentAt
                        ? formatSmartDateTime(email.sentAt)
                        : formatSmartDateTime(email.createdAt)}
                    </p>
                  </div>

                  {/* Right: status + action */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <TrueSendStatusBadge status={email.status} />
                        </span>
                      </TooltipTrigger>
                      {email.failureReason && (
                        <TooltipContent className="max-w-xs">
                          <p>{email.failureReason}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>

                    {canResend(email) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={resending === email.id}
                        onClick={() => handleResend(email.id)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 mr-1 ${
                            resending === email.id ? "animate-spin" : ""
                          }`}
                        />
                        Resend
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="pt-2 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                  >
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Load More ({emails.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
