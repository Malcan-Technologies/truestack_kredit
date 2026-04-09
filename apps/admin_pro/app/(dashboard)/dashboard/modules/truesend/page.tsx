"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, ClockAlert, Info, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface TrueSendModuleData {
  enabled: boolean;
  settings: {
    paymentReminderDays: number[];
    latePaymentNoticeDays: number[];
  };
  constraints: {
    maxReminderFrequencyCount: number;
    maxPaymentReminderDay: number;
    maxLatePaymentNoticeDay: number;
    arrearsPeriod: number;
    defaultPeriod: number;
  };
}

interface ValidationErrors {
  paymentReminderDays?: string;
  latePaymentNoticeDays?: string;
}

interface AddOnEntry {
  addOnType: string;
  status: string;
}

interface EmailStats {
  total: number;
}

interface BillingAddOnsResponse {
  addOns: AddOnEntry[];
  emailStats?: EmailStats;
}

const FALLBACK_CONSTRAINTS = {
  maxReminderFrequencyCount: 3,
  maxPaymentReminderDay: 30,
  maxLatePaymentNoticeDay: 14,
  arrearsPeriod: 14,
  defaultPeriod: 28,
};
const MINS_PER_EMAIL = 5;

function formatTimeSaved(totalCount: number, minsPerUnit: number): string {
  const totalMins = totalCount * minsPerUnit;
  if (totalMins < 60) return `${Math.round(totalMins)} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function parseAndValidateDays(
  label: string,
  values: string[],
  min: number,
  max: number,
  sortDirection: "asc" | "desc",
  maxCount: number,
): { parsed: number[]; error?: string } {
  const trimmed = values.map((value) => value.trim()).filter((value) => value.length > 0);

  if (trimmed.length === 0) {
    return { parsed: [], error: `${label} requires at least 1 value.` };
  }

  if (trimmed.length > maxCount) {
    return { parsed: [], error: `${label} supports at most ${maxCount} values.` };
  }

  const parsed: number[] = [];
  for (const value of trimmed) {
    if (!/^\d+$/.test(value)) {
      return { parsed: [], error: `${label} must use whole numbers only.` };
    }
    const day = Number(value);
    if (!Number.isInteger(day) || day < min || day > max) {
      return { parsed: [], error: `${label} must be between ${min} and ${max} days.` };
    }
    parsed.push(day);
  }

  if (new Set(parsed).size !== parsed.length) {
    return { parsed: [], error: `${label} cannot contain duplicate day values.` };
  }

  const sorted = [...parsed].sort((a, b) => (sortDirection === "asc" ? a - b : b - a));
  return { parsed: sorted };
}

function TrueSendModuleSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-36" />
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-7 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-lg mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-28 shrink-0" />
              <Skeleton className="h-4 flex-1 max-w-[200px]" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-40 rounded-md" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-full max-w-lg mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-28 shrink-0" />
              <Skeleton className="h-4 flex-1 max-w-[200px]" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            </div>
          ))}
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full max-w-2xl mt-2" />
          <Skeleton className="h-4 w-full max-w-xl mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TrueSendModulePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [paymentReminderDays, setPaymentReminderDays] = useState<string[]>(["3", "1", "0"]);
  const [latePaymentNoticeDays, setLatePaymentNoticeDays] = useState<string[]>(["3", "7", "10"]);
  const [initialPaymentReminderDays, setInitialPaymentReminderDays] = useState<string[]>(["3", "1", "0"]);
  const [initialLatePaymentNoticeDays, setInitialLatePaymentNoticeDays] = useState<string[]>(["3", "7", "10"]);
  const [constraints, setConstraints] = useState(FALLBACK_CONSTRAINTS);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [emailSentCount, setEmailSentCount] = useState(0);

  const maxFrequencyCount = constraints.maxReminderFrequencyCount;

  const hasFormChanges = useMemo(() => {
    return (
      JSON.stringify(paymentReminderDays) !== JSON.stringify(initialPaymentReminderDays) ||
      JSON.stringify(latePaymentNoticeDays) !== JSON.stringify(initialLatePaymentNoticeDays)
    );
  }, [paymentReminderDays, latePaymentNoticeDays, initialPaymentReminderDays, initialLatePaymentNoticeDays]);

  /** Email stats from billing add-ons API (Pro: TrueSend is included; no add-on purchase). */
  const fetchTrueSendEmailStats = async (): Promise<number | null> => {
    try {
      const addOnRes = await api.get<BillingAddOnsResponse>("/billing/add-ons");
      if (!addOnRes.success || !addOnRes.data?.addOns) {
        return null;
      }
      return addOnRes.data.emailStats?.total ?? 0;
    } catch {
      return null;
    }
  };

  const loadModuleSettings = async () => {
    setLoading(true);
    try {
      const emailTotal = await fetchTrueSendEmailStats();
      const res = await api.get<TrueSendModuleData>("/tenants/modules/truesend");
      if (!res.success || !res.data) {
        if (emailTotal !== null) {
          setEmailSentCount(emailTotal);
        }
        toast.error(res.error || "Failed to load TrueSend settings");
        return;
      }

      setEnabled(res.data.enabled);
      if (emailTotal !== null) {
        setEmailSentCount(emailTotal);
      }
      setConstraints({
        maxReminderFrequencyCount: res.data.constraints.maxReminderFrequencyCount,
        maxPaymentReminderDay: res.data.constraints.maxPaymentReminderDay,
        maxLatePaymentNoticeDay: res.data.constraints.maxLatePaymentNoticeDay,
        arrearsPeriod: res.data.constraints.arrearsPeriod,
        defaultPeriod: res.data.constraints.defaultPeriod,
      });
      setPaymentReminderDays(res.data.settings.paymentReminderDays.map(String));
      setLatePaymentNoticeDays(res.data.settings.latePaymentNoticeDays.map(String));
      setInitialPaymentReminderDays(res.data.settings.paymentReminderDays.map(String));
      setInitialLatePaymentNoticeDays(res.data.settings.latePaymentNoticeDays.map(String));
      setErrors({});
    } catch {
      const emailTotal = await fetchTrueSendEmailStats();
      if (emailTotal !== null) {
        setEmailSentCount(emailTotal);
      }
      toast.error("Failed to load TrueSend settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModuleSettings();
  }, []);

  const handleSave = async () => {
    const paymentValidation = parseAndValidateDays(
      "Payment reminder days",
      paymentReminderDays,
      0,
      constraints.maxPaymentReminderDay,
      "desc",
      constraints.maxReminderFrequencyCount,
    );
    const lateValidation = parseAndValidateDays(
      "Late payment notice days",
      latePaymentNoticeDays,
      1,
      constraints.maxLatePaymentNoticeDay,
      "asc",
      constraints.maxReminderFrequencyCount,
    );

    const nextErrors: ValidationErrors = {
      paymentReminderDays: paymentValidation.error,
      latePaymentNoticeDays: lateValidation.error,
    };
    setErrors(nextErrors);

    if (paymentValidation.error || lateValidation.error) {
      return;
    }

    setSaving(true);
    try {
      const res = await api.patch<TrueSendModuleData>("/tenants/modules/truesend", {
        paymentReminderDays: paymentValidation.parsed,
        latePaymentNoticeDays: lateValidation.parsed,
      });

      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to save TrueSend settings");
        return;
      }

      setEnabled(res.data.enabled);
      setConstraints({
        maxReminderFrequencyCount: res.data.constraints.maxReminderFrequencyCount,
        maxPaymentReminderDay: res.data.constraints.maxPaymentReminderDay,
        maxLatePaymentNoticeDay: res.data.constraints.maxLatePaymentNoticeDay,
        arrearsPeriod: res.data.constraints.arrearsPeriod,
        defaultPeriod: res.data.constraints.defaultPeriod,
      });
      setPaymentReminderDays(res.data.settings.paymentReminderDays.map(String));
      setLatePaymentNoticeDays(res.data.settings.latePaymentNoticeDays.map(String));
      setInitialPaymentReminderDays(res.data.settings.paymentReminderDays.map(String));
      setInitialLatePaymentNoticeDays(res.data.settings.latePaymentNoticeDays.map(String));
      setErrors({});
      setIsEditing(false);
      toast.success("TrueSend settings updated");
      const emailTotal = await fetchTrueSendEmailStats();
      if (emailTotal !== null) {
        setEmailSentCount(emailTotal);
      }
    } catch {
      toast.error("Failed to save TrueSend settings");
    } finally {
      setSaving(false);
    }
  };

  const updateValue = (
    setter: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string,
  ) => {
    setter((prev) => prev.map((entry, i) => (i === index ? value : entry)));
  };

  const removeValue = (
    setter: Dispatch<SetStateAction<string[]>>,
    values: string[],
    index: number,
  ) => {
    if (values.length <= 1) return;
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancelEdit = () => {
    setPaymentReminderDays(initialPaymentReminderDays);
    setLatePaymentNoticeDays(initialLatePaymentNoticeDays);
    setErrors({});
    setIsEditing(false);
  };

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
      {loading ? (
        <TrueSendModuleSkeleton />
      ) : (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Send className="h-6 w-6 text-muted-foreground" />
              TrueSend™ Module
            </h1>
            <p className="text-muted text-sm mt-1">
              Configure tenant-level email frequency for reminders and late payment notices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button asChild type="button" variant="outline">
              <Link href="/dashboard/settings">Organization settings</Link>
            </Button>
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading || !enabled || !hasFormChanges}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!enabled}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        {!enabled && (
          <div className="rounded-lg border border-border bg-neutral-100 dark:bg-neutral-800/50 px-4 py-3 text-sm text-muted flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              TrueSend™ is unavailable because this organization is not active. Contact support if this is unexpected.
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage impact</CardTitle>
            <CardDescription>
              Based on total TrueSend delivery activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Amount sent</p>
                <p className="mt-2 text-xl font-semibold">{formatNumber(emailSentCount, 0)} emails</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Estimated time saved</p>
                <p className="mt-2 text-xl font-semibold">{formatTimeSaved(emailSentCount, MINS_PER_EMAIL)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-muted-foreground" />
              Payment Reminders
            </CardTitle>
            <CardDescription>
              Configure days before due date to send reminders. Maximum {maxFrequencyCount} reminders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentReminderDays.map((value, index) => (
              <div key={`payment-reminder-${index}`} className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={constraints.maxPaymentReminderDay}
                  value={value}
                  onChange={(e) => updateValue(setPaymentReminderDays, index, e.target.value)}
                  disabled={saving || !enabled || !isEditing}
                  className="w-28"
                />
                <span className="text-sm text-muted">days before due date</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeValue(setPaymentReminderDays, paymentReminderDays, index)}
                  disabled={saving || !enabled || !isEditing || paymentReminderDays.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {errors.paymentReminderDays && (
              <p className="text-sm text-destructive">{errors.paymentReminderDays}</p>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentReminderDays((prev) => [...prev, ""])}
              disabled={saving || !enabled || !isEditing || paymentReminderDays.length >= maxFrequencyCount}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add reminder day
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClockAlert className="h-5 w-5 text-muted-foreground" />
              Late Payment Notices
            </CardTitle>
            <CardDescription>
              Configure days after due date when repayment is still pending or partial. Maximum {maxFrequencyCount} notices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latePaymentNoticeDays.map((value, index) => (
              <div key={`late-notice-${index}`} className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={constraints.maxLatePaymentNoticeDay}
                  value={value}
                  onChange={(e) => updateValue(setLatePaymentNoticeDays, index, e.target.value)}
                  disabled={saving || !enabled || !isEditing}
                  className="w-28"
                />
                <span className="text-sm text-muted">days after due date</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeValue(setLatePaymentNoticeDays, latePaymentNoticeDays, index)}
                  disabled={saving || !enabled || !isEditing || latePaymentNoticeDays.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {errors.latePaymentNoticeDays && (
              <p className="text-sm text-destructive">{errors.latePaymentNoticeDays}</p>
            )}

            <p className="text-xs text-muted">
              Maximum day is {constraints.maxLatePaymentNoticeDay} (bounded by arrears period).
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() => setLatePaymentNoticeDays((prev) => [...prev, ""])}
              disabled={saving || !enabled || !isEditing || latePaymentNoticeDays.length >= maxFrequencyCount}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add late notice day
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              Arrears & Default Notices
            </CardTitle>
            <CardDescription>
              These frequencies follow product-level loan lifecycle settings and are not configurable here. <br /> Email notices are also automatically triggered when an arrear or default notice is manually regenerated (limited to 1 time per day).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-neutral-100 dark:bg-neutral-800/50 px-4 py-3 text-sm">
              <p className="font-medium">Arrears notice</p>
              <p className="text-muted mt-1">
                Sent automatically when the loan enters arrears (after {constraints.arrearsPeriod} days overdue).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-neutral-100 dark:bg-neutral-800/50 px-4 py-3 text-sm">
              <p className="font-medium">Default notice</p>
              <p className="text-muted mt-1">
                Sent when a loan is marked as defaulted (default period: {constraints.defaultPeriod} days overdue).
              </p>
            </div>
            {/* <p className="text-xs text-muted flex items-center gap-2">
              <Info className="h-3.5 w-3.5" />
              Dates are stored in UTC and evaluated using Malaysia timezone (GMT+8).
            </p> */}
          </CardContent>
        </Card>

      </div>
      )}
    </RoleGate>
  );
}
