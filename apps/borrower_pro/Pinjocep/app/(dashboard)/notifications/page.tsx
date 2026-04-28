"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { BorrowerNotificationCategoryIcon } from "@borrower_pro/lib/borrower-notification-category-icon";
import { borrowerNotificationCategoryLabel } from "@kredit/borrower";
import { Button } from "@borrower_pro/components/ui/button";
import { Badge } from "@borrower_pro/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@borrower_pro/components/ui/card";
import { RefreshButton } from "@borrower_pro/components/ui/refresh-button";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import {
  fetchBorrowerMe,
  peekPendingAcceptInvitationPath,
} from "@borrower_pro/lib/borrower-auth-client";
import {
  listBorrowerNotifications,
  markAllBorrowerNotificationsRead,
  markBorrowerNotificationRead,
  notifyBorrowerNotificationsInboxUpdated,
  type BorrowerNotificationItem,
} from "@borrower_pro/lib/borrower-notifications-client";
import { normalizeBorrowerNotificationHref } from "@borrower_pro/lib/borrower-notification-href";
import { formatDateTime, formatRelativeTime } from "@borrower_pro/lib/utils";
import { cn } from "@borrower_pro/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 15;

const CATEGORY_ICON_TILE = cn(
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-muted/10",
  "dark:bg-muted/5"
);

function NotificationCardSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="p-3 sm:p-4">
        <div className="flex min-w-0 gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 flex-1 max-w-md" />
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
            <Skeleton className="h-3 max-w-lg w-full" />
            <Skeleton className="h-3 max-w-lg w-full" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <Skeleton className="h-3 w-28" />
              <div className="flex shrink-0 gap-2">
                <Skeleton className="h-8 w-[4.5rem] rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BorrowerNotificationsPage() {
  const router = useRouter();
  /** Mirrors profile page: no API calls until borrower onboarding has at least one profile. */
  const [sessionGate, setSessionGate] = useState<"checking" | "ready">("checking");
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<BorrowerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } | null>(null);

  const fetchNotificationsPage = useCallback(
    async (targetPage: number, options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading !== false;
      if (showLoading) setLoading(true);
      try {
        const response = await listBorrowerNotifications({ page: targetPage, pageSize: PAGE_SIZE });
        setNotifications(response.data);
        setUnreadCount(response.unreadCount);
        setPagination(response.pagination);
        setPage(response.pagination.page);
        notifyBorrowerNotificationsInboxUpdated();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load notifications");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meRes = await fetchBorrowerMe();
        if (cancelled) return;
        if (!meRes.success) {
          setSessionGate("ready");
          return;
        }
        if (meRes.data.profileCount === 0) {
          const pending = peekPendingAcceptInvitationPath();
          router.replace(pending ?? "/onboarding");
          return;
        }
        setSessionGate("ready");
      } catch {
        if (!cancelled) router.replace("/onboarding");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (sessionGate !== "ready") return;
    void fetchNotificationsPage(1);
  }, [sessionGate, fetchNotificationsPage]);

  const refreshFirstPage = useCallback(() => void fetchNotificationsPage(1), [fetchNotificationsPage]);

  const handleMarkRead = useCallback(async (notificationId: string) => {
    setMarkingId(notificationId);
    try {
      const response = await markBorrowerNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? response.data : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      notifyBorrowerNotificationsInboxUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update notification");
    } finally {
      setMarkingId(null);
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllBorrowerNotificationsRead();
      setNotifications((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      notifyBorrowerNotificationsInboxUpdated();
      toast.success("All notifications marked as read");
      await fetchNotificationsPage(1, { showLoading: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update notifications");
    } finally {
      setMarkingAll(false);
    }
  }, [fetchNotificationsPage]);

  const notificationCards = useMemo(
    () =>
      notifications.map((notification) => {
        const channels = [
          ...new Set(
            (notification.deliveries ?? [])
              .filter((delivery) => delivery.channel !== "in_app")
              .map((delivery) => delivery.channel.toUpperCase())
          ),
        ];
        const isUnread = !notification.readAt;
        const openHref = normalizeBorrowerNotificationHref(notification.deepLink);

        return (
          <Card
            key={notification.id}
            className={cn(
              "transition-colors",
              isUnread ? "border-border bg-muted/20 dark:bg-muted/15" : "border-border"
            )}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex min-w-0 gap-3">
                <div
                  className={cn(
                    CATEGORY_ICON_TILE,
                    isUnread && "border-border/60 bg-muted/25 dark:border-border/40 dark:bg-muted/20"
                  )}
                  title={borrowerNotificationCategoryLabel(notification.category)}
                >
                  <BorrowerNotificationCategoryIcon
                    category={notification.category}
                    className={cn("h-5 w-5", isUnread ? "text-foreground" : "text-muted-foreground")}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-heading font-semibold leading-snug line-clamp-2 min-w-0 flex-1">
                      {notification.title}
                    </h2>
                    <Badge
                      variant={isUnread ? "info" : "secondary"}
                      className="text-xs font-normal shrink-0 mt-0.5"
                    >
                      {isUnread ? "Unread" : "Read"}
                    </Badge>
                  </div>
                  {channels.length > 0 ? (
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {channels.join(" · ")}
                    </p>
                  ) : null}
                  {notification.body ? (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {notification.body}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-2",
                      openHref || isUnread ? "justify-between" : ""
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs text-muted-foreground tabular-nums",
                        openHref || isUnread ? "min-w-0 flex-1" : ""
                      )}
                      title={formatDateTime(notification.createdAt)}
                    >
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                    {openHref || isUnread ? (
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {openHref ? (
                          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                            <Link href={openHref}>
                              Open
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                        {isUnread ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => void handleMarkRead(notification.id)}
                            disabled={markingId === notification.id}
                          >
                            {markingId === notification.id ? "Updating..." : "Mark read"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      }),
    [handleMarkRead, markingId, notifications]
  );

  const showPagination =
    pagination !== null && pagination.totalPages > 1;

  if (sessionGate !== "ready") {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 max-w-full rounded-md bg-muted animate-pulse" aria-hidden />
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <NotificationCardSkeleton key={i} />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2 text-gradient">
            <BellRing className="h-6 w-6 text-muted-foreground" />
            Notifications
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Updates about your applications, loans, payments, and lender announcements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={unreadCount > 0 ? "info" : "secondary"}>
            {unreadCount} unread
          </Badge>
          <RefreshButton
            onRefresh={refreshFirstPage}
            showLabel
            successMessage="Notifications refreshed"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleMarkAllRead()}
            disabled={markingAll || unreadCount === 0 || loading}
          >
            <CheckCheck className="h-4 w-4" />
            {markingAll ? "Updating..." : "Mark all as read"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Notification center</CardTitle>
          <CardDescription>
            Platform announcements appear here alongside your automated borrower updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <NotificationCardSkeleton key={i} />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 font-medium">No notifications yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                When the lender sends updates or your application status changes, they will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5">{notificationCards}</div>
              {showPagination && pagination ? (
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                    <span className="text-muted-foreground/80">
                      {" "}
                      ({pagination.total} total)
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchNotificationsPage(page - 1)}
                      disabled={loading || page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchNotificationsPage(page + 1)}
                      disabled={loading || page >= pagination.totalPages}
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
    </div>
  );
}
