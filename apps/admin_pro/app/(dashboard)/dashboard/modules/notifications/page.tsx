"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  RefreshCw,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type NotificationChannel = "email" | "in_app" | "push";

interface AudienceOption {
  value: string;
  label: string;
  description: string;
}

interface AutomationRow {
  key: string;
  label: string;
  description: string;
  category: string;
  supportedChannels: NotificationChannel[];
  channels: Record<NotificationChannel, boolean>;
}

interface NotificationSettingsResponse {
  enabled: boolean;
  automations: AutomationRow[];
  truesend: {
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
  audiences: AudienceOption[];
}

interface NotificationCampaign {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  audienceType: string;
  channels: string[];
  status: string;
  recipientCount: number;
  publishedAt: string | null;
  createdAt: string;
}

interface DeliveryLogItem {
  id: string;
  channel: string;
  channels?: string[];
  status: string;
  notificationType: string;
  title: string;
  body: string | null;
  notificationKey: string;
  recipient: string | null;
  borrowerName: string | null;
  provider: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  isGroupedBroadcast?: boolean;
  recipientCount?: number;
  audienceType?: string | null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kuala_Lumpur",
    });
  } catch {
    return value;
  }
}

function categoryLabel(category: string): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Display labels aligned with automation column headers (Email, Web + App, App (Push)). */
function formatNotificationChannelLabel(channel: string): string {
  const c = channel.toLowerCase();
  if (c === "email") return "Email";
  if (c === "in_app") return "Web + App";
  if (c === "push") return "App (Push)";
  return channel
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function getDeliveryRecipientLabel(delivery: DeliveryLogItem): string {
  if (delivery.isGroupedBroadcast) {
    const count = delivery.recipientCount ?? 0;
    const audienceLabel = delivery.audienceType
      ? categoryLabel(delivery.audienceType)
      : null;
    return `${count} recipient${count === 1 ? "" : "s"}${
      audienceLabel ? ` (${audienceLabel})` : ""
    }`;
  }

  return delivery.borrowerName || delivery.recipient || "—";
}

function getDeliveryTypeLabel(delivery: DeliveryLogItem): string {
  return delivery.notificationType;
}

/** Push is stored as an add-on: backend always pairs it with in-app for broadcasts. */
function normalizeCampaignChannelsForDisplay(channels: string[]): string[] {
  const next = new Set(channels);
  if (next.has("push")) {
    next.add("in_app");
  }
  return Array.from(next);
}

function AutomationsTabSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-4 w-36" />
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] table-fixed text-sm">
              <colgroup>
                <col />
                <col className="min-w-[100px] w-[100px]" />
                <col className="min-w-[104px] w-[104px]" />
                <col className="min-w-[100px] w-[100px]" />
              </colgroup>
              <thead className="bg-secondary/40">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <Skeleton className="h-4 w-16" />
                  </th>
                  {[0, 1, 2].map((i) => (
                    <th key={i} className="px-2 py-3 text-center">
                      <Skeleton className="h-4 w-20 mx-auto" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3].map((row) => (
                  <tr key={row} className="border-t border-border">
                    <td className="px-4 py-3 align-top">
                      <Skeleton className="h-4 w-48 max-w-full mb-2" />
                      <Skeleton className="h-3 w-full max-w-xl" />
                    </td>
                    {[0, 1, 2].map((c) => (
                      <td key={c} className="px-2 py-3 text-center">
                        <div className="flex h-9 items-center justify-center">
                          <Skeleton className="h-4 w-4 rounded-sm" />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function BroadcastsTabSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-8 items-start">
      <div className="space-y-4 min-w-0">
        <Skeleton className="h-5 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="min-w-0 lg:border-l lg:border-border lg:pl-6 space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-full max-w-xs" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function DeliveryLogsTabSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-secondary/40">
          <tr>
            {["Created", "Channel", "Status", "Type", "Message", "Recipients"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, row) => (
            <tr key={row} className="border-t border-border align-top">
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-36" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-24" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-5 w-20" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-40 mb-1" />
                <Skeleton className="h-3 w-28" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-32" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-40 mb-1" />
                <Skeleton className="h-3 w-full max-w-[18rem]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DELIVERY_PAGE_SIZE = 15;

function cloneAutomations(rows: AutomationRow[]): AutomationRow[] {
  return rows.map((row) => ({
    ...row,
    channels: { ...row.channels },
  }));
}

function ChannelColumnHeader({ label, children }: { label: string; children: ReactNode }) {
  return (
    <th className="px-2 py-3 text-center font-medium align-middle">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help border-b border-dotted border-border">{label}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left">{children}</TooltipContent>
      </Tooltip>
    </th>
  );
}

export default function NotificationsModulePage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishingCampaignId, setPublishingCampaignId] = useState<string | null>(null);
  const [cancellingCampaignId, setCancellingCampaignId] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [settings, setSettings] = useState<NotificationSettingsResponse | null>(null);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [paymentReminderDaysInput, setPaymentReminderDaysInput] = useState("3, 1, 0");
  const [latePaymentNoticeDaysInput, setLatePaymentNoticeDaysInput] = useState("3, 7, 10");
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryLogItem[]>([]);
  const [deliveryPagination, setDeliveryPagination] = useState<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveriesFetching, setDeliveriesFetching] = useState(false);
  const [audienceType, setAudienceType] = useState("ALL_BORROWERS");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignDeepLink, setCampaignDeepLink] = useState("");
  const [campaignChannels, setCampaignChannels] = useState<Record<"in_app" | "push", boolean>>({
    in_app: true,
    push: true,
  });

  const [activeTab, setActiveTab] = useState("automations");
  const [automationsEditMode, setAutomationsEditMode] = useState(false);
  const [automationsBaseline, setAutomationsBaseline] = useState<{
    automations: AutomationRow[];
    paymentReminder: string;
    latePayment: string;
  } | null>(null);

  const fetchDeliveriesPage = useCallback(async (page: number) => {
    setDeliveriesFetching(true);
    try {
      const res = await api.get<DeliveryLogItem[]>(
        `/notifications/deliveries?page=${page}&pageSize=${DELIVERY_PAGE_SIZE}`,
      );
      if (!res.success) {
        throw new Error(res.error || "Failed to load delivery logs.");
      }
      setDeliveries(res.data ?? []);
      setDeliveryPagination(res.pagination ?? null);
      setDeliveryPage(page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load delivery logs");
    } finally {
      setDeliveriesFetching(false);
    }
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, campaignsRes, deliveriesRes] = await Promise.all([
        api.get<NotificationSettingsResponse>("/notifications/settings"),
        api.get<NotificationCampaign[]>("/notifications/campaigns"),
        api.get<DeliveryLogItem[]>(
          `/notifications/deliveries?page=1&pageSize=${DELIVERY_PAGE_SIZE}`,
        ),
      ]);

      if (!settingsRes.success || !settingsRes.data) {
        throw new Error(settingsRes.error || "Failed to load notification settings.");
      }

      setSettings(settingsRes.data);
      setAutomations(settingsRes.data.automations);
      const pr = settingsRes.data.truesend.paymentReminderDays.join(", ");
      const lp = settingsRes.data.truesend.latePaymentNoticeDays.join(", ");
      setPaymentReminderDaysInput(pr);
      setLatePaymentNoticeDaysInput(lp);
      setAutomationsBaseline({
        automations: cloneAutomations(settingsRes.data.automations),
        paymentReminder: pr,
        latePayment: lp,
      });
      setAutomationsEditMode(false);
      setAudienceType(settingsRes.data.audiences[0]?.value || "ALL_BORROWERS");
      setCampaigns(campaignsRes.data ?? []);
      setDeliveries(deliveriesRes.data ?? []);
      setDeliveryPagination(deliveriesRes.pagination ?? null);
      setDeliveryPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load notifications module");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const automationsDirty = useMemo(() => {
    if (!automationsBaseline) return false;
    return (
      JSON.stringify(automations) !== JSON.stringify(automationsBaseline.automations) ||
      paymentReminderDaysInput !== automationsBaseline.paymentReminder ||
      latePaymentNoticeDaysInput !== automationsBaseline.latePayment
    );
  }, [
    automations,
    paymentReminderDaysInput,
    latePaymentNoticeDaysInput,
    automationsBaseline,
  ]);

  const handleCancelAutomationsEdit = useCallback(() => {
    if (!automationsBaseline) return;
    setAutomations(cloneAutomations(automationsBaseline.automations));
    setPaymentReminderDaysInput(automationsBaseline.paymentReminder);
    setLatePaymentNoticeDaysInput(automationsBaseline.latePayment);
    setAutomationsEditMode(false);
  }, [automationsBaseline]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (
        activeTab === "automations" &&
        value !== "automations" &&
        automationsEditMode &&
        automationsDirty
      ) {
        if (!window.confirm("Discard unsaved changes to automations?")) {
          return;
        }
        handleCancelAutomationsEdit();
      }
      setActiveTab(value);
    },
    [activeTab, automationsEditMode, automationsDirty, handleCancelAutomationsEdit],
  );

  const groupedAutomations = useMemo(() => {
    const groups = new Map<string, AutomationRow[]>();
    for (const automation of automations) {
      const rows = groups.get(automation.category) ?? [];
      rows.push(automation);
      groups.set(automation.category, rows);
    }
    return Array.from(groups.entries());
  }, [automations]);

  const selectedCampaignChannels = useMemo(
    () =>
      (Object.entries(campaignChannels) as Array<[keyof typeof campaignChannels, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([channel]) => channel),
    [campaignChannels],
  );

  const toggleAutomationChannel = (
    automationKey: string,
    channel: NotificationChannel,
    checked: boolean,
  ) => {
    setAutomations((current) =>
      current.map((automation) => {
        if (automation.key !== automationKey) {
          return automation;
        }
        const next = { ...automation.channels };
        if (channel === "email") {
          next.email = checked;
        } else if (channel === "in_app") {
          next.in_app = checked;
          if (!checked && automation.supportedChannels.includes("push")) {
            next.push = false;
          }
        } else if (channel === "push") {
          if (checked) {
            next.push = true;
            if (automation.supportedChannels.includes("in_app")) {
              next.in_app = true;
            }
          } else {
            next.push = false;
          }
        }
        return { ...automation, channels: next };
      }),
    );
  };

  const parseDayInput = (value: string): number[] =>
    value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isInteger(day));

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const response = await api.patch<NotificationSettingsResponse>("/notifications/settings", {
        automations: automations.map((automation) => ({
          key: automation.key,
          channels: automation.channels,
        })),
        truesend: {
          paymentReminderDays: parseDayInput(paymentReminderDaysInput),
          latePaymentNoticeDays: parseDayInput(latePaymentNoticeDaysInput),
        },
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to save notification settings.");
      }

      setSettings(response.data);
      setAutomations(response.data.automations);
      const prSaved = response.data.truesend.paymentReminderDays.join(", ");
      const lpSaved = response.data.truesend.latePaymentNoticeDays.join(", ");
      setPaymentReminderDaysInput(prSaved);
      setLatePaymentNoticeDaysInput(lpSaved);
      setAutomationsBaseline({
        automations: cloneAutomations(response.data.automations),
        paymentReminder: prSaved,
        latePayment: lpSaved,
      });
      setAutomationsEditMode(false);
      toast.success("Notification settings updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateCampaign = async () => {
    setCreatingCampaign(true);
    try {
      const response = await api.post<NotificationCampaign>("/notifications/campaigns", {
        title: campaignTitle,
        body: campaignBody,
        deepLink: campaignDeepLink,
        audienceType,
        channels: selectedCampaignChannels,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to create campaign draft.");
      }

      setCampaigns((current) => [response.data!, ...current]);
      setCampaignTitle("");
      setCampaignBody("");
      setCampaignDeepLink("");
      setCampaignChannels({ in_app: true, push: true });
      toast.success("Campaign draft created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create campaign");
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handlePublishCampaign = async (campaignId: string) => {
    setPublishingCampaignId(campaignId);
    try {
      const response = await api.post<NotificationCampaign>(
        `/notifications/campaigns/${encodeURIComponent(campaignId)}/publish`,
        {},
      );

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to publish campaign.");
      }

      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === campaignId ? response.data! : campaign)),
      );
      toast.success("Campaign published");
      await fetchDeliveriesPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish campaign");
    } finally {
      setPublishingCampaignId(null);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    setCancellingCampaignId(campaignId);
    try {
      const response = await api.post<NotificationCampaign>(
        `/notifications/campaigns/${encodeURIComponent(campaignId)}/cancel`,
        {},
      );

      if (!response.success || !response.data) {
        throw new Error(response.error || "Failed to cancel campaign.");
      }

      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === campaignId ? response.data! : campaign)),
      );
      toast.success("Campaign cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel campaign");
    } finally {
      setCancellingCampaignId(null);
    }
  };

  return (
    <RoleGate
      requiredPermissions={[
        "notifications.view",
        "notifications.manage_settings",
        "notifications.send_broadcast",
        "notifications.view_logs",
        "truesend.view",
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <BellRing className="h-6 w-6 text-muted-foreground" />
              Notifications
            </h1>
            <p className="text-muted text-sm mt-1">
              Unified automations, borrower inbox delivery, mobile push, and campaign publishing for TrueKredit Pro.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {activeTab === "automations" ? (
              !automationsEditMode ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAutomationsEditMode(true)}
                  disabled={loading || !automationsBaseline}
                >
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (automationsDirty) {
                        if (!window.confirm("Discard unsaved changes?")) return;
                      }
                      handleCancelAutomationsEdit();
                    }}
                    disabled={savingSettings}
                  >
                    Cancel
                  </Button>
                  {automationsDirty ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveSettings()}
                      disabled={savingSettings || loading}
                    >
                      {savingSettings ? "Saving..." : "Save notification settings"}
                    </Button>
                  ) : null}
                </>
              )
            ) : null}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="h-11 p-1.5">
            <TabsTrigger value="automations" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Automations
            </TabsTrigger>
            <TabsTrigger value="broadcasts" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Broadcasts
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Send className="h-4 w-4" />
              Delivery Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="automations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Channel toggles</CardTitle>
                <CardDescription>
                  Everything defaults to enabled. Email remains authoritative for formal notices while borrower web/mobile inbox and push extend visibility.
                  Reminder frequency for payment reminders and late notices is configured in those rows below (comma-separated days).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
                  <AutomationsTabSkeleton />
                ) : (
                  <TooltipProvider delayDuration={300}>
                    {groupedAutomations.map(([category, rows]) => (
                    <div key={category} className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {categoryLabel(category)}
                        </h3>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[560px] table-fixed text-sm">
                          <colgroup>
                            <col />
                            <col className="min-w-[100px] w-[100px]" />
                            <col className="min-w-[104px] w-[104px]" />
                            <col className="min-w-[100px] w-[100px]" />
                          </colgroup>
                          <thead className="bg-secondary/40">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium align-middle">Event</th>
                              <ChannelColumnHeader label="Email">
                                <p>
                                  Sends this automation to the borrower&apos;s registered email address
                                  when enabled (formal notices and email-led flows).
                                </p>
                                <p className="opacity-70 text-xs mt-1">
                                  Separate from the in-app notification center.
                                </p>
                              </ChannelColumnHeader>
                              <ChannelColumnHeader label="Web + App">
                                <p>
                                  Delivers to the borrower notification inbox: TrueKredit Pro on the web
                                  and the in-app notification list on mobile (one shared in-app record).
                                </p>
                                <p className="opacity-70 text-xs mt-1">
                                  Maps to the in-app channel in your backend.
                                </p>
                              </ChannelColumnHeader>
                              <ChannelColumnHeader label="App (Push)">
                                <p>
                                  Additional OS-level alert on registered mobile devices (Expo push).
                                  Requires Web + App — checking Push automatically enables the shared inbox
                                  for that event.
                                </p>
                                <p className="opacity-70 text-xs mt-1">
                                  Clearing Web + App turns Push off for that row.
                                </p>
                              </ChannelColumnHeader>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((automation) => (
                              <tr key={automation.key} className="border-t border-border">
                                <td className="px-4 py-3 align-top">
                                  <p className="font-medium">{automation.label}</p>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    {automation.description}
                                  </p>
                                  {automation.key === "payment_reminder" ? (
                                    <div className="mt-3 space-y-1.5 pt-3 border-t border-border max-w-md">
                                      <label
                                        htmlFor="frequency-payment-reminder-days"
                                        className="text-xs font-medium"
                                      >
                                        Frequency: days before due date
                                      </label>
                                      <Input
                                        id="frequency-payment-reminder-days"
                                        value={paymentReminderDaysInput}
                                        onChange={(event) =>
                                          setPaymentReminderDaysInput(event.target.value)
                                        }
                                        placeholder="3, 1, 0"
                                        className="h-9 text-sm"
                                        disabled={loading || !automationsEditMode}
                                        autoComplete="off"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Comma-separated days before the repayment due date. Max{" "}
                                        {settings?.constraints.maxReminderFrequencyCount ?? 3}{" "}
                                        values.
                                      </p>
                                    </div>
                                  ) : null}
                                  {automation.key === "late_payment_notice" ? (
                                    <div className="mt-3 space-y-1.5 pt-3 border-t border-border max-w-md">
                                      <label
                                        htmlFor="frequency-late-payment-notice-days"
                                        className="text-xs font-medium"
                                      >
                                        Frequency: days after due date
                                      </label>
                                      <Input
                                        id="frequency-late-payment-notice-days"
                                        value={latePaymentNoticeDaysInput}
                                        onChange={(event) =>
                                          setLatePaymentNoticeDaysInput(event.target.value)
                                        }
                                        placeholder="3, 7, 10"
                                        className="h-9 text-sm"
                                        disabled={loading || !automationsEditMode}
                                        autoComplete="off"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Comma-separated days after the due date. Max day is{" "}
                                        {settings?.constraints.maxLatePaymentNoticeDay ?? 14}{" "}
                                        (arrears period).
                                      </p>
                                    </div>
                                  ) : null}
                                </td>
                                {(["email", "in_app", "push"] as NotificationChannel[]).map((channel) => (
                                  <td
                                    key={channel}
                                    className="px-2 py-3 text-center align-middle"
                                  >
                                    {automation.supportedChannels.includes(channel) ? (
                                      <div className="flex h-9 items-center justify-center">
                                        <Checkbox
                                          checked={automation.channels[channel]}
                                          disabled={
                                            loading ||
                                            !automationsEditMode ||
                                            (channel === "push" &&
                                              automation.supportedChannels.includes("in_app") &&
                                              !automation.channels.in_app)
                                          }
                                          onCheckedChange={(checked) =>
                                            toggleAutomationChannel(
                                              automation.key,
                                              channel,
                                              checked === true,
                                            )
                                          }
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex h-9 items-center justify-center">
                                        <span className="text-xs text-muted-foreground">—</span>
                                      </div>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  </TooltipProvider>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="broadcasts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Broadcasts</CardTitle>
                <CardDescription>
                  Draft campaigns for all borrowers, active borrowers, overdue borrowers, or applicants.{" "}
                  <span className="text-muted-foreground">
                    Web + App posts to the shared borrower inbox (web and mobile). App (Push) adds mobile OS
                    alerts and requires Web + App — enabling Push checks both.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <BroadcastsTabSkeleton />
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-8 items-start">
                  <div className="space-y-4 min-w-0">
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Create draft</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Audience</label>
                          <Select value={audienceType} onValueChange={setAudienceType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select audience" />
                            </SelectTrigger>
                            <SelectContent>
                              {(settings?.audiences ?? []).map((audience) => (
                                <SelectItem key={audience.value} value={audience.value}>
                                  {audience.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Deep link</label>
                          <Input
                            value={campaignDeepLink}
                            onChange={(event) => setCampaignDeepLink(event.target.value)}
                            placeholder="/loans"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Title</label>
                      <Input
                        value={campaignTitle}
                        onChange={(event) => setCampaignTitle(event.target.value)}
                        placeholder="Scheduled maintenance notice"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Body</label>
                      <Textarea
                        value={campaignBody}
                        onChange={(event) => setCampaignBody(event.target.value)}
                        placeholder="We will perform maintenance tonight from 11:00 PM MYT."
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={campaignChannels.in_app}
                          onCheckedChange={(checked) =>
                            setCampaignChannels((current) => ({
                              in_app: checked === true,
                              push: checked === true ? current.push : false,
                            }))
                          }
                        />
                        Web + App
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={campaignChannels.push}
                          disabled={!campaignChannels.in_app}
                          onCheckedChange={(checked) =>
                            setCampaignChannels((current) => ({
                              ...current,
                              push: checked === true,
                              in_app: checked === true ? true : current.in_app,
                            }))
                          }
                        />
                        <span>
                          App (Push)
                          {!campaignChannels.in_app ? (
                            <span className="text-muted-foreground text-xs ml-1">(enable Web + App first)</span>
                          ) : null}
                        </span>
                      </label>
                    </div>
                    <Button
                      onClick={handleCreateCampaign}
                      disabled={
                        creatingCampaign ||
                        selectedCampaignChannels.length === 0 ||
                        !campaignTitle.trim() ||
                        !campaignBody.trim()
                      }
                    >
                      {creatingCampaign ? "Creating..." : "Create draft"}
                    </Button>
                  </div>

                  <div className="min-w-0 lg:border-l lg:border-border lg:pl-6 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Campaigns</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Draft first, then publish. Fan-out uses the same Web + App and App (Push) paths as automations.
                      </p>
                    </div>
                    {campaigns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                    ) : (
                      <ul className="space-y-3 max-h-[min(70vh,36rem)] overflow-y-auto pr-1">
                        {campaigns.map((campaign) => (
                          <li
                            key={campaign.id}
                            className="rounded-lg border border-border p-3 space-y-2"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="font-medium text-sm leading-snug">{campaign.title}</p>
                                <Badge variant="outline" className="shrink-0">
                                  {campaign.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-3">{campaign.body}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Audience: {campaign.audienceType} · Channels:{" "}
                                {normalizeCampaignChannelsForDisplay(campaign.channels)
                                  .map(formatNotificationChannelLabel)
                                  .join(", ")}{" "}
                                · Created {formatDateTime(campaign.createdAt)}
                              </p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {campaign.status === "DRAFT" ? (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => void handlePublishCampaign(campaign.id)}
                                      disabled={publishingCampaignId === campaign.id}
                                    >
                                      {publishingCampaignId === campaign.id ? "Publishing..." : "Publish"}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleCancelCampaign(campaign.id)}
                                      disabled={cancellingCampaignId === campaign.id}
                                    >
                                      {cancellingCampaignId === campaign.id ? "Cancelling..." : "Cancel"}
                                    </Button>
                                  </>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    {campaign.recipientCount} recipients
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Recent deliveries</CardTitle>
                <CardDescription>
                  Individual notifications stay as their own rows. Broadcast campaigns are grouped into a
                  single entry so large fan-out sends do not flood the log. Web + App is the borrower inbox
                  channel; App (Push) adds mobile OS delivery and always implies an inbox record.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <DeliveryLogsTabSkeleton />
                ) : deliveries.length === 0 && !deliveriesFetching ? (
                  <p className="text-sm text-muted-foreground">No delivery activity yet.</p>
                ) : (
                  <>
                    <div
                      className={`overflow-x-auto rounded-lg border border-border ${deliveriesFetching ? "opacity-60" : ""}`}
                    >
                      <table className="min-w-full text-sm">
                        <thead className="bg-secondary/40">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Channel</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Type</th>
                            <th className="px-4 py-3 text-left font-medium">Message</th>
                            <th className="px-4 py-3 text-left font-medium">Recipients</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.map((delivery) => (
                            <tr key={delivery.id} className="border-t border-border align-top">
                              <td className="px-4 py-3 whitespace-nowrap">
                                {formatDateTime(delivery.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {(delivery.channels?.length ? delivery.channels : [delivery.channel]).map(
                                    (channel) => (
                                      <Badge
                                        key={`${delivery.id}-${channel}`}
                                        variant="outline"
                                        className="font-normal normal-case"
                                      >
                                        {formatNotificationChannelLabel(channel)}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="font-normal normal-case">
                                  {delivery.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium">{getDeliveryTypeLabel(delivery)}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium">{delivery.title}</p>
                                {delivery.body ? (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {delivery.body}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">{getDeliveryRecipientLabel(delivery)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {deliveryPagination && deliveryPagination.totalPages > 1 ? (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                          Page {deliveryPagination.page} of {deliveryPagination.totalPages} ({deliveryPagination.total}{" "}
                          total)
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void fetchDeliveriesPage(deliveryPage - 1)}
                            disabled={deliveryPage <= 1 || deliveriesFetching}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void fetchDeliveriesPage(deliveryPage + 1)}
                            disabled={
                              deliveryPage >= deliveryPagination.totalPages || deliveriesFetching
                            }
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}

