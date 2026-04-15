"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronRight, Inbox } from "lucide-react";

import { Button } from "@borrower_pro/components/ui/button";
import { AppDropdownMenuContent } from "@borrower_pro/components/ui/app-dropdown-menu";
import { DropdownMenu, DropdownMenuTrigger } from "@borrower_pro/components/ui/dropdown-menu";
import { Separator } from "@borrower_pro/components/ui/separator";
import { Skeleton } from "@borrower_pro/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@borrower_pro/components/ui/tooltip";
import {
  BORROWER_NOTIFICATIONS_INBOX_UPDATED_EVENT,
  listBorrowerNotifications,
  markBorrowerNotificationRead,
  type BorrowerNotificationItem,
} from "@borrower_pro/lib/borrower-notifications-client";
import { BorrowerNotificationCategoryIcon } from "@borrower_pro/lib/borrower-notification-category-icon";
import { borrowerNotificationCategoryLabel } from "@kredit/borrower";
import { cn, formatDateTime, formatRelativeTime } from "@borrower_pro/lib/utils";

const PAGE_SIZE = 10;

function notificationHref(n: BorrowerNotificationItem): string {
  if (n.deepLink && n.deepLink.startsWith("/")) {
    return n.deepLink;
  }
  return "/notifications";
}

interface BorrowerNotificationBellProps {
  /** When false (onboarding incomplete), bell is disabled like sidebar nav. */
  disabled?: boolean;
}

export function BorrowerNotificationBell({ disabled = false }: BorrowerNotificationBellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BorrowerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState<{
    page: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (page: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await listBorrowerNotifications({ page, pageSize: PAGE_SIZE });
      setUnreadCount(res.unreadCount);
      setPagination({
        page: res.pagination.page,
        totalPages: res.pagination.totalPages,
      });
      setItems((prev) => (append ? [...prev, ...res.data] : res.data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        void loadPage(1, false);
      }
    },
    [loadPage]
  );

  /** Badge count: refetch on route change (layout stays mounted) and when inbox fires an update event. */
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    const refreshUnread = () => {
      void listBorrowerNotifications({ page: 1, pageSize: 1 }).then((res) => {
        if (!cancelled) setUnreadCount(res.unreadCount);
      });
    };
    refreshUnread();
    const onInboxUpdated = () => refreshUnread();
    window.addEventListener(BORROWER_NOTIFICATIONS_INBOX_UPDATED_EVENT, onInboxUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(BORROWER_NOTIFICATIONS_INBOX_UPDATED_EVENT, onInboxUpdated);
    };
  }, [disabled, pathname]);

  const handleLoadMore = useCallback(() => {
    if (!pagination || loadingMore || loading) return;
    if (pagination.page >= pagination.totalPages) return;
    void loadPage(pagination.page + 1, true);
  }, [loadPage, loading, loadingMore, pagination]);

  const handleRowNavigate = useCallback((n: BorrowerNotificationItem) => {
    if (!n.readAt) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x))
      );
      void markBorrowerNotificationRead(n.id).catch(() => {
        /* best-effort; inbox page can reconcile */
      });
    }
  }, []);

  if (disabled) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled
                className="relative shrink-0"
                aria-label="Notifications unavailable"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={16}
            className="max-w-[min(20rem,calc(100vw-2rem))]"
          >
            <p>Notifications are available after you complete onboarding.</p>
            <p className="opacity-70 text-xs mt-1">Finish setting up your borrower profile to unlock this area.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const showLoadMore =
    pagination !== null && pagination.totalPages > 1 && pagination.page < pagination.totalPages;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                "bg-primary text-[10px] font-medium leading-none text-primary-foreground"
              )}
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <AppDropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-2rem,22rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-heading font-semibold leading-none">Notifications</p>
              {unreadCount > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">{unreadCount} unread</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">You&apos;re all caught up</p>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
              <Link href="/notifications" className="gap-1">
                View all
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <Separator />

        <div
          className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain"
          role="feed"
          aria-label="Recent notifications"
        >
          {loading ? (
            <div className="space-y-3 p-3" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-4/5 max-w-[12rem]" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/3 max-w-[5rem]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void loadPage(1, false)}
              >
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <Inbox className="h-9 w-9 text-muted-foreground/50" aria-hidden />
              <p className="mt-2 text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[16rem]">
                Updates from your lender will show up here.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {items.map((n) => {
                const href = notificationHref(n);
                const isUnread = !n.readAt;
                return (
                  <li key={n.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={href}
                      className={cn(
                        "block px-3 py-2.5 text-left transition-colors hover:bg-secondary/80",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isUnread && "bg-info/5"
                      )}
                      title={formatDateTime(n.createdAt)}
                      onClick={() => handleRowNavigate(n)}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/10 dark:bg-muted/5",
                            isUnread && "border-primary/20 bg-primary/[0.04] dark:bg-primary/[0.06]"
                          )}
                          title={borrowerNotificationCategoryLabel(n.category)}
                        >
                          <BorrowerNotificationCategoryIcon
                            category={n.category}
                            className={cn("h-4 w-4", isUnread ? "text-primary" : "text-muted-foreground")}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm leading-snug line-clamp-2",
                              isUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
                            )}
                          >
                            {n.title}
                          </p>
                          {n.body ? (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                            {formatRelativeTime(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {showLoadMore && !loading && !error ? (
          <>
            <Separator />
            <div className="p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                disabled={loadingMore}
                onClick={(e) => {
                  e.preventDefault();
                  handleLoadMore();
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          </>
        ) : null}
      </AppDropdownMenuContent>
    </DropdownMenu>
  );
}
