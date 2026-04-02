"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Package,
  ClipboardList,
  Menu,
  Calendar,
  HelpCircle,
  ScrollText,
  Calculator,
  CircleDollarSign,
  Shield,
  UserCircle,
  ChevronDown,
  Megaphone,
  Lock,
  ChevronsLeft,
  ChevronsRight,
  Phone,
  Store,
  Blocks,
  Send,
  Fingerprint,
  Sparkles,
  Banknote,
} from "lucide-react";
import { fetchSecurityStatus, useSession, signOut } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TenantProvider } from "@/components/tenant-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { canAccessPage } from "@/lib/permissions";
import type { TenantRole } from "@/lib/permissions";
import { api } from "@/lib/api";
import { TENANT_DATA_UPDATED_EVENT } from "@/lib/tenant-events";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ADMIN_ACCESS_REQUIRED_MESSAGE,
  revokeUnauthorizedAdminAccess,
} from "@/lib/finish-login";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

interface Membership {
  role: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Loan Management",
    items: [
      { name: "Borrowers", href: "/dashboard/borrowers", icon: Users },
      {
        name: "Applications",
        href: "/dashboard/applications",
        icon: ClipboardList,
      },
      { name: "Loans", href: "/dashboard/loans", icon: CircleDollarSign },
    ],
  },
  {
    title: "Business",
    items: [
      { name: "Products", href: "/dashboard/products", icon: Package },
      { name: "Compliance", href: "/dashboard/compliance", icon: Shield },
      { name: "Debt Marketplace", href: "/dashboard/debt-marketplace", icon: Store },
      {
        name: "Modules",
        href: "/dashboard/modules",
        icon: Blocks,
        children: [
          { name: "TrueSend™", href: "/dashboard/modules/truesend", icon: Send },
          { name: "TrueIdentity™", href: "/dashboard/modules/trueidentity", icon: Fingerprint },
        ],
      },
    ],
  },
  {
    title: "TrueKredit Pro",
    items: [
      {
        name: "Attestation meetings",
        href: "/dashboard/truekredit-pro/attestation-meetings",
        icon: Sparkles,
      },
      {
        name: "Availability settings",
        href: "/dashboard/truekredit-pro/availability",
        icon: Calendar,
      },
      {
        name: "Payment approvals",
        href: "/dashboard/truekredit-pro/payment-approvals",
        icon: Banknote,
      },
    ],
  },
  {
    title: "Tools",
    items: [
      { name: "Calculator", href: "/dashboard/calculator", icon: Calculator },
      { name: "Help", href: "/dashboard/help", icon: HelpCircle },
      { name: "Contact", href: "/dashboard/contact", icon: Phone },
    ],
  },
  {
    title: "Administration",
    items: [
      { name: "Promotions", href: "/dashboard/promotions", icon: Megaphone },
      { name: "Admin Logs", href: "/dashboard/admin-logs", icon: ScrollText },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

// Paths that require a tenant membership; without membership, sidebar items are disabled and direct URL returns 404
const PATHS_REQUIRING_MEMBERSHIP = [
  "/dashboard/borrowers",
  "/dashboard/products",
  "/dashboard/applications",
  "/dashboard/loans",
  "/dashboard/compliance",
  "/dashboard/promotions",
  "/dashboard/debt-marketplace",
  "/dashboard/calculator",
  "/dashboard/admin-logs",
  "/dashboard/modules",
  "/dashboard/truekredit-pro",
];

function pathRequiresMembership(href: string): boolean {
  return PATHS_REQUIRING_MEMBERSHIP.some((p) => href === p || href.startsWith(p + "/"));
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'FREE' | 'PAID' | 'OVERDUE' | 'SUSPENDED'>('PAID');
  const [hasTenants, setHasTenants] = useState<boolean>(true);
  const [membershipCheckComplete, setMembershipCheckComplete] = useState(false);
  const [securityCheckComplete, setSecurityCheckComplete] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({
    "/dashboard/modules": false,
  });
  const [applicationsPendingCount, setApplicationsPendingCount] = useState(0);
  const [loansPendingDisbursementCount, setLoansPendingDisbursementCount] = useState(0);
  const [loansPendingAttestationCount, setLoansPendingAttestationCount] = useState(0);
  const [attestationSlotProposedCount, setAttestationSlotProposedCount] = useState(0);
  const [paymentApprovalsPendingCount, setPaymentApprovalsPendingCount] = useState(0);
  const [isSigningOutUnauthorized, setIsSigningOutUnauthorized] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  useEffect(() => {
    if (pathname.startsWith("/dashboard/modules")) {
      setExpandedNavGroups((prev) => ({ ...prev, "/dashboard/modules": true }));
    }
  }, [pathname]);

  const fetchApplicationsPendingCount = useCallback(async () => {
    if (!hasTenants) {
      setApplicationsPendingCount(0);
      return;
    }
    api
      .get<{ submitted: number; underReview: number }>("/api/loans/applications/counts")
      .then((res) => {
        if (res.success && res.data) {
          setApplicationsPendingCount(res.data.submitted + res.data.underReview);
        }
      })
      .catch(() => setApplicationsPendingCount(0));
  }, [hasTenants]);

  // Fetch applications pending count on mount and when count may have changed
  useEffect(() => {
    fetchApplicationsPendingCount();
  }, [fetchApplicationsPendingCount]);

  const fetchLoanCounts = useCallback(async () => {
    if (!hasTenants) {
      setLoansPendingDisbursementCount(0);
      setLoansPendingAttestationCount(0);
      setAttestationSlotProposedCount(0);
      return;
    }
    try {
      const [countsRes, queueRes] = await Promise.all([
        api.get<{
          pendingDisbursement: number;
          pendingAttestation?: number;
          attestationSlotProposed?: number;
        }>("/api/loans/counts"),
        api.get<Array<{ attestationStatus: string }>>("/api/loans/attestation-queue"),
      ]);

      if (countsRes.success && countsRes.data) {
        setLoansPendingDisbursementCount(countsRes.data.pendingDisbursement ?? 0);
        setLoansPendingAttestationCount(countsRes.data.pendingAttestation ?? 0);
      } else {
        setLoansPendingDisbursementCount(0);
        setLoansPendingAttestationCount(0);
      }

      // Same source as Attestation meetings page: borrower-chosen slot awaiting admin (SLOT_PROPOSED)
      if (queueRes.success && Array.isArray(queueRes.data)) {
        setAttestationSlotProposedCount(
          queueRes.data.filter((r) => r.attestationStatus === "SLOT_PROPOSED").length,
        );
      } else if (countsRes.success && countsRes.data?.attestationSlotProposed != null) {
        setAttestationSlotProposedCount(countsRes.data.attestationSlotProposed);
      } else {
        setAttestationSlotProposedCount(0);
      }
    } catch {
      setLoansPendingDisbursementCount(0);
      setLoansPendingAttestationCount(0);
      setAttestationSlotProposedCount(0);
    }
  }, [hasTenants]);

  const fetchPaymentApprovalsPendingCount = useCallback(async () => {
    if (!hasTenants) {
      setPaymentApprovalsPendingCount(0);
      return;
    }
    try {
      const res = await api.get<{
        items: unknown[];
        pagination: { total: number };
      }>("/api/schedules/manual-payment-requests?status=PENDING&page=1&pageSize=1");
      if (res.success && res.data?.pagination) {
        setPaymentApprovalsPendingCount(res.data.pagination.total ?? 0);
      } else {
        setPaymentApprovalsPendingCount(0);
      }
    } catch {
      setPaymentApprovalsPendingCount(0);
    }
  }, [hasTenants]);

  // Fetch loan-related sidebar counts on mount and when count may have changed
  useEffect(() => {
    void fetchLoanCounts();
  }, [fetchLoanCounts]);

  useEffect(() => {
    void fetchPaymentApprovalsPendingCount();
  }, [fetchPaymentApprovalsPendingCount]);

  // Refresh attestation / loan badges when opening TrueKredit Pro (e.g. borrower proposed a slot while you were elsewhere)
  useEffect(() => {
    if (!hasTenants) return;
    if (pathname.startsWith("/dashboard/truekredit-pro")) {
      void fetchLoanCounts();
      void fetchPaymentApprovalsPendingCount();
    }
  }, [pathname, hasTenants, fetchLoanCounts, fetchPaymentApprovalsPendingCount]);

  // Listen for count changes (approve, reject, return-to-draft on application detail)
  useEffect(() => {
    const handler = () => fetchApplicationsPendingCount();
    window.addEventListener("applications-count-changed", handler);
    return () => window.removeEventListener("applications-count-changed", handler);
  }, [fetchApplicationsPendingCount]);

  // Listen for loans / attestation queue count changes (disburse, attestation actions)
  useEffect(() => {
    const handler = () => void fetchLoanCounts();
    window.addEventListener("loans-count-changed", handler);
    window.addEventListener("attestation-queue-changed", handler);
    return () => {
      window.removeEventListener("loans-count-changed", handler);
      window.removeEventListener("attestation-queue-changed", handler);
    };
  }, [fetchLoanCounts]);

  useEffect(() => {
    const handler = () => void fetchPaymentApprovalsPendingCount();
    window.addEventListener("manual-payment-requests-changed", handler);
    return () => window.removeEventListener("manual-payment-requests-changed", handler);
  }, [fetchPaymentApprovalsPendingCount]);

  const ensureActiveTenantAndFetchMembership = useCallback(async () => {
    try {
      const membershipsRes = await fetch("/api/proxy/auth/memberships", {
        credentials: "include",
      });

      if (membershipsRes.status === 401) {
        setMembership({ role: "NONE", tenantName: undefined, tenantLogoUrl: null });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      let membershipsData: { success?: boolean; data?: { memberships?: unknown[]; activeTenantId?: string } };
      try {
        membershipsData = await membershipsRes.json();
      } catch {
        setMembership({ role: "NONE", tenantName: undefined, tenantLogoUrl: null });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      if (
        !membershipsData.success ||
        !membershipsData.data?.memberships?.length
      ) {
        setMembership({ role: "NONE", tenantName: undefined, tenantLogoUrl: null });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      setHasTenants(true);

      if (!membershipsData.data.activeTenantId) {
        const firstTenant = membershipsData.data.memberships[0] as {
          tenantId: string;
          role: string;
          tenantName?: string;
          tenantLogoUrl?: string | null;
        };
        await fetch("/api/proxy/auth/switch-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantId: firstTenant.tenantId }),
        });
        setMembership({
          role: firstTenant.role,
          tenantName: firstTenant.tenantName,
          tenantLogoUrl: firstTenant.tenantLogoUrl ?? null,
        });
        setMembershipCheckComplete(true);
        return;
      }

      const activeMembership = (membershipsData.data.memberships as {
        tenantId: string;
        tenantName?: string;
        tenantLogoUrl?: string | null;
      }[]).find(
        (m) => m.tenantId === membershipsData.data!.activeTenantId,
      );

      const response = await fetch("/api/proxy/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const tenant = data.data.tenant as
            | { subscriptionStatus?: string; status?: string; logoUrl?: string | null }
            | null
            | undefined;
          setMembership({
            role: data.data.user.role,
            tenantName:
              activeMembership?.tenantName || data.data.user.tenantName,
            tenantLogoUrl:
              activeMembership?.tenantLogoUrl ?? tenant?.logoUrl ?? null,
          });
          const isPro = process.env.NEXT_PUBLIC_PRODUCT_MODE === "pro";
          if (isPro) {
            setSubscriptionStatus(tenant?.status === "SUSPENDED" ? "SUSPENDED" : "PAID");
          } else {
            const status = tenant?.subscriptionStatus;
            if (status === "PAID" || status === "OVERDUE" || status === "SUSPENDED") {
              setSubscriptionStatus(status);
            } else {
              setSubscriptionStatus("FREE");
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch membership:", error);
      setMembership({ role: "NONE", tenantName: undefined, tenantLogoUrl: null });
      setHasTenants(false);
    } finally {
      setMembershipCheckComplete(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    const handleTenantDataUpdated = () => {
      void ensureActiveTenantAndFetchMembership();
    };

    window.addEventListener(TENANT_DATA_UPDATED_EVENT, handleTenantDataUpdated);
    return () => {
      window.removeEventListener(TENANT_DATA_UPDATED_EVENT, handleTenantDataUpdated);
    };
  }, [session, ensureActiveTenantAndFetchMembership]);

  useEffect(() => {
    if (!session || !membershipCheckComplete || hasTenants || isSigningOutUnauthorized) {
      return;
    }

    let cancelled = false;
    setIsSigningOutUnauthorized(true);
    toast.error(ADMIN_ACCESS_REQUIRED_MESSAGE);

    void revokeUnauthorizedAdminAccess().finally(() => {
      if (cancelled) return;
      router.replace("/login");
    });

    return () => {
      cancelled = true;
    };
  }, [
    session,
    membershipCheckComplete,
    hasTenants,
    isSigningOutUnauthorized,
    router,
  ]);

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isPending && !session) {
      router.push("/login");
      return;
    }

    // Ensure active tenant is set and fetch membership info
    if (session) {
      void ensureActiveTenantAndFetchMembership();
    }
  }, [session, isPending, router, ensureActiveTenantAndFetchMembership]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setSecurityCheckComplete(true);
      return;
    }

    const securityPaths = new Set(["/dashboard/profile", "/dashboard/security-setup"]);
    const isSecurityPath = securityPaths.has(pathname);
    let cancelled = false;

    setSecurityCheckComplete(false);

    void fetchSecurityStatus(session.user as { emailVerified?: boolean; twoFactorEnabled?: boolean })
      .then((status) => {
        if (cancelled) return;
        if (!status.isSecuritySetupComplete && !isSecurityPath) {
          router.replace(`/dashboard/security-setup?returnTo=${encodeURIComponent(pathname)}`);
          return;
        }
        setSecurityCheckComplete(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSecurityCheckComplete(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, isPending, pathname, router]);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Don't render tenant-scoped content until we know if user has a tenant
  // (avoids 401s from dashboard/other pages calling tenant APIs before we've set hasTenants)
  if (!membershipCheckComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!securityCheckComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (isSigningOutUnauthorized || !hasTenants) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Redirecting...</div>
      </div>
    );
  }

  const user = session.user;
  const tenantDisplayName = membership?.tenantName ?? "Organization";
  const tenantInitial = tenantDisplayName.slice(0, 1).toUpperCase() || "?";

  const pathRequiresMembershipCheck = PATHS_REQUIRING_MEMBERSHIP.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!hasTenants && pathRequiresMembershipCheck) {
    notFound();
  }

  return (
    <TenantProvider role={(membership?.role as TenantRole) || "STAFF"} hasTenants={hasTenants} subscriptionStatus={subscriptionStatus}>
      <div className="min-h-screen bg-background">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full bg-surface border-r border-border transform transition-all duration-200 ease-in-out lg:translate-x-0",
            sidebarCollapsed ? "w-16" : "w-64",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex flex-col h-full">
            {/* Single-tenant Pro: show org branding only (no tenant switching) */}
            <div
              className={cn(
                "border-b border-border shrink-0",
                sidebarCollapsed ? "px-1 py-2 flex justify-center" : "px-3 py-3",
              )}
            >
              {!sidebarCollapsed ? (
                <div className="flex items-center gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                    {membership?.tenantLogoUrl ? (
                      <Image
                        src={membership.tenantLogoUrl}
                        alt={`${tenantDisplayName} logo`}
                        fill
                        className="object-contain p-1"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">
                        {tenantInitial}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Badge
                      variant="outline"
                      className="w-fit border-0 bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black"
                    >
                      Admin
                    </Badge>
                    <p className="truncate text-sm font-semibold" title={tenantDisplayName}>
                      {tenantDisplayName}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                  {membership?.tenantLogoUrl ? (
                    <Image
                      src={membership.tenantLogoUrl}
                      alt={`${tenantDisplayName} logo`}
                      fill
                      className="object-contain p-1"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      {tenantInitial}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Navigation */}
            <nav className={cn("flex-1 py-4 overflow-y-auto", sidebarCollapsed ? "px-1" : "px-2")}>
              <TooltipProvider delayDuration={0}>
                {navigationSections.map((section, sectionIndex) => (
                  <div
                    key={section.title}
                    className={cn(sectionIndex > 0 && (sidebarCollapsed ? "mt-3" : "mt-6"))}
                  >
                    {!sidebarCollapsed && (
                      <p className="px-3 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
                        {section.title}
                      </p>
                    )}
                    {sidebarCollapsed && sectionIndex > 0 && (
                      <div className="mx-2 mb-2 border-t border-border" />
                    )}
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        if (item.children && item.children.length > 0) {
                          const groupExpanded = expandedNavGroups[item.href] ?? false;
                          const childItems = item.children.map((child) => {
                            const isChildActive =
                              pathname === child.href ||
                              pathname.startsWith(child.href + "/");
                            const memberRole = (membership?.role as TenantRole) || "STAFF";
                            const hasAccess = canAccessPage(memberRole, child.href);
                            const requiresMembership = pathRequiresMembership(child.href);
                            const disabledNoMembership = !hasTenants && requiresMembership;

                            return {
                              ...child,
                              isChildActive,
                              disabled: !hasAccess || disabledNoMembership,
                              disabledNoMembership,
                            };
                          });

                          const hasEnabledChildren = childItems.some((child) => !child.disabled);
                          const isGroupActive = childItems.some((child) => child.isChildActive);

                          const parentContent = (
                            <button
                              type="button"
                              onClick={() => {
                                if (sidebarCollapsed) return;
                                setExpandedNavGroups((prev) => ({
                                  ...prev,
                                  [item.href]: !groupExpanded,
                                }));
                              }}
                              className={cn(
                                "w-full flex items-center rounded-lg text-sm font-medium transition-colors",
                                sidebarCollapsed
                                  ? "justify-center px-0 py-2 relative"
                                  : "gap-3 px-3 py-2",
                                hasEnabledChildren
                                  ? isGroupActive
                                    ? "bg-secondary text-foreground"
                                    : "text-muted hover:text-foreground hover:bg-secondary"
                                  : "opacity-40 cursor-not-allowed select-none",
                              )}
                              disabled={!hasEnabledChildren}
                            >
                              <item.icon className="h-5 w-5 shrink-0" />
                              {!sidebarCollapsed && (
                                <>
                                  <span className="flex-1 text-left">{item.name}</span>
                                  <ChevronDown
                                    className={cn("h-4 w-4 transition-transform", groupExpanded ? "rotate-180" : "rotate-0")}
                                  />
                                </>
                              )}
                            </button>
                          );

                          if (sidebarCollapsed) {
                            return (
                              <DropdownMenu key={item.name}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          "w-full flex items-center rounded-lg text-sm font-medium transition-colors",
                                          "justify-center px-0 py-2 relative",
                                          hasEnabledChildren
                                            ? isGroupActive
                                              ? "bg-secondary text-foreground"
                                              : "text-muted hover:text-foreground hover:bg-secondary"
                                            : "opacity-40 cursor-not-allowed select-none",
                                        )}
                                        disabled={!hasEnabledChildren}
                                      >
                                        <item.icon className="h-5 w-5 shrink-0" />
                                      </button>
                                    </DropdownMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p>{item.name} – click to open</p>
                                  </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent
                                  side="right"
                                  align="start"
                                  sideOffset={8}
                                  className="min-w-[180px]"
                                >
                                  {childItems.map((child) =>
                                    child.disabled ? (
                                      <DropdownMenuItem
                                        key={child.href}
                                        disabled
                                        className="opacity-60 cursor-not-allowed"
                                      >
                                        <child.icon className="h-4 w-4 mr-2" />
                                        {child.name}
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        key={child.href}
                                        onClick={() => {
                                          router.push(child.href);
                                          setSidebarOpen(false);
                                        }}
                                      >
                                        <child.icon className="h-4 w-4 mr-2" />
                                        {child.name}
                                      </DropdownMenuItem>
                                    ),
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          }

                          return (
                            <div key={item.name} className="space-y-1">
                              {parentContent}
                              {groupExpanded && (
                                <div className="space-y-1 pl-7">
                                  {childItems.map((child) => {
                                    if (child.disabled) {
                                      return (
                                        <div
                                          key={child.href}
                                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium opacity-40 cursor-not-allowed select-none"
                                        >
                                          <child.icon className="h-4 w-4 shrink-0" />
                                          <span className="flex-1">{child.name}</span>
                                          <Lock className="h-3.5 w-3.5" />
                                        </div>
                                      );
                                    }

                                    return (
                                      <Link
                                        key={child.href}
                                        href={child.href}
                                        className={cn(
                                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                          child.isChildActive
                                            ? "bg-secondary text-foreground"
                                            : "text-muted hover:text-foreground hover:bg-secondary",
                                        )}
                                        onClick={() => setSidebarOpen(false)}
                                      >
                                        <child.icon className="h-4 w-4 shrink-0" />
                                        <span className="flex-1">{child.name}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        const isActive =
                          pathname === item.href ||
                          (item.href !== "/dashboard" &&
                            pathname.startsWith(item.href));
                        const memberRole = (membership?.role as TenantRole) || "STAFF";
                        const hasAccess = canAccessPage(memberRole, item.href);
                        const requiresMembership = pathRequiresMembership(item.href);
                        const disabledNoMembership = !hasTenants && requiresMembership;

                        if (!hasAccess || disabledNoMembership) {
                          const lockedContent = (
                            <div
                              key={item.name}
                              className={cn(
                                "flex items-center rounded-lg text-sm font-medium opacity-40 cursor-not-allowed select-none",
                                sidebarCollapsed
                                  ? "justify-center px-0 py-2"
                                  : "gap-3 px-3 py-2",
                              )}
                            >
                              <item.icon className="h-5 w-5 shrink-0" />
                              {!sidebarCollapsed && (
                                <>
                                  <span className="flex-1">{item.name}</span>
                                  <Lock className="h-3.5 w-3.5" />
                                </>
                              )}
                            </div>
                          );

                          if (sidebarCollapsed) {
                            return (
                              <Tooltip key={item.name}>
                                <TooltipTrigger asChild>
                                  {lockedContent}
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <p>{item.name}</p>
                                  <p className="opacity-70 text-xs">
                                    {disabledNoMembership
                                      ? "No organization access"
                                      : "Locked"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return lockedContent;
                        }

                        const isApplications = item.href === "/dashboard/applications";
                        const isLoans = item.href === "/dashboard/loans";
                        const isAttestationMeetings =
                          item.href === "/dashboard/truekredit-pro/attestation-meetings";
                        const isPaymentApprovals =
                          item.href === "/dashboard/truekredit-pro/payment-approvals";
                        const linkContent = (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              "flex items-center rounded-lg text-sm font-medium transition-colors",
                              sidebarCollapsed
                                ? "justify-center px-0 py-2 relative"
                                : "gap-3 px-3 py-2",
                              isActive
                                ? "bg-secondary text-foreground"
                                : "text-muted hover:text-foreground hover:bg-secondary",
                            )}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!sidebarCollapsed && (
                              <>
                                <span className="flex-1">{item.name}</span>
                                {isApplications && applicationsPendingCount > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                                    {applicationsPendingCount}
                                  </Badge>
                                )}
                                {isLoans &&
                                  loansPendingDisbursementCount + loansPendingAttestationCount > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                                    {loansPendingDisbursementCount + loansPendingAttestationCount}
                                  </Badge>
                                )}
                                {isAttestationMeetings && attestationSlotProposedCount > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                                    {attestationSlotProposedCount > 99 ? "99+" : attestationSlotProposedCount}
                                  </Badge>
                                )}
                                {isPaymentApprovals && paymentApprovalsPendingCount > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                                    {paymentApprovalsPendingCount > 99 ? "99+" : paymentApprovalsPendingCount}
                                  </Badge>
                                )}
                              </>
                            )}
                            {sidebarCollapsed && isApplications && applicationsPendingCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {applicationsPendingCount > 99 ? "99+" : applicationsPendingCount}
                              </span>
                            )}
                            {sidebarCollapsed &&
                              isLoans &&
                              loansPendingDisbursementCount + loansPendingAttestationCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {loansPendingDisbursementCount + loansPendingAttestationCount > 99
                                  ? "99+"
                                  : loansPendingDisbursementCount + loansPendingAttestationCount}
                              </span>
                            )}
                            {sidebarCollapsed && isAttestationMeetings && attestationSlotProposedCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {attestationSlotProposedCount > 99 ? "99+" : attestationSlotProposedCount}
                              </span>
                            )}
                            {sidebarCollapsed && isPaymentApprovals && paymentApprovalsPendingCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {paymentApprovalsPendingCount > 99 ? "99+" : paymentApprovalsPendingCount}
                              </span>
                            )}
                          </Link>
                        );

                        if (sidebarCollapsed) {
                          return (
                            <Tooltip key={item.name}>
                              <TooltipTrigger asChild>
                                {linkContent}
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>{item.name}</p>
                                {isApplications && applicationsPendingCount > 0 && (
                                  <p className="opacity-70 text-xs mt-1">
                                    {applicationsPendingCount} pending decision
                                  </p>
                                )}
                                {isLoans &&
                                  loansPendingDisbursementCount + loansPendingAttestationCount > 0 && (
                                  <p className="opacity-70 text-xs mt-1">
                                    {[
                                      loansPendingDisbursementCount > 0 &&
                                        `${loansPendingDisbursementCount} pending disbursement`,
                                      loansPendingAttestationCount > 0 &&
                                        `${loansPendingAttestationCount} pending attestation`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                )}
                                {isAttestationMeetings && attestationSlotProposedCount > 0 && (
                                  <p className="opacity-70 text-xs mt-1">
                                    {attestationSlotProposedCount} proposed slot
                                    {attestationSlotProposedCount === 1 ? "" : "s"} to review
                                  </p>
                                )}
                                {isPaymentApprovals && paymentApprovalsPendingCount > 0 && (
                                  <p className="opacity-70 text-xs mt-1">
                                    {paymentApprovalsPendingCount} payment request
                                    {paymentApprovalsPendingCount === 1 ? "" : "s"} to approve
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return linkContent;
                      })}
                    </div>
                  </div>
                ))}
              </TooltipProvider>
            </nav>

            {/* Collapse toggle */}
            <div className={cn("border-t border-border", sidebarCollapsed ? "px-1 py-2" : "px-2 py-2")}>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("w-full", sidebarCollapsed ? "h-9" : "h-9")}
                      onClick={toggleSidebarCollapse}
                    >
                      {sidebarCollapsed ? (
                        <ChevronsRight className="h-4 w-4" />
                      ) : (
                        <ChevronsLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right">
                      <p>Expand sidebar</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* User info - dashed outline so it's clear this is a menu trigger */}
            <div className={cn("border-t border-border", sidebarCollapsed ? "p-2" : "p-4")}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "group flex items-center w-full rounded-lg border border-border hover:border-foreground/30 hover:bg-secondary transition-colors outline-none focus:ring-0",
                      sidebarCollapsed
                        ? "justify-center p-1.5"
                        : "gap-3 p-2",
                    )}
                    aria-label="Open user menu"
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium shrink-0",
                      sidebarCollapsed ? "w-8 h-8 text-xs" : "w-10 h-10",
                    )}>
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </div>

                    {/* User info */}
                    {!sidebarCollapsed && (
                      <>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium truncate">
                            {user.name || user.email}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {membership?.role || "STAFF"}
                          </Badge>
                        </div>

                        {/* Chevron */}
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:-rotate-90"
                        />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>

                {/* Dropdown content */}
                <DropdownMenuContent
                  side="right"
                  align="start"
                  sideOffset={8}
                  alignOffset={-20}
                  className="w-56 border border-border bg-surface shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=right]:slide-in-from-left-2"
                >
                  <DropdownMenuItem
                    onClick={() => router.push("/dashboard/profile")}
                  >
                    <UserCircle className="h-4 w-4 mr-2" />
                    Profile
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* TrueKredit branding */}
            <div className={cn(
              "border-t border-border py-3 flex flex-row items-center gap-2",
              sidebarCollapsed ? "px-1 justify-center" : "px-4 justify-between",
            )}>
              <div className={cn(
                "flex flex-row items-center gap-2",
                sidebarCollapsed && "justify-center",
              )}>
                {!sidebarCollapsed && (
                  <p className="text-[10px] font-medium text-muted-foreground/50 tracking-wide shrink-0">
                    Powered by
                  </p>
                )}
                <a href="https://truestack.my" target="_blank" rel="noopener noreferrer" className="flex items-center shrink-0">
                {mounted ? (
                  <Image
                    src={
                      resolvedTheme === "dark"
                        ? "/logo-dark.png"
                        : "/logo-light.png"
                    }
                    alt="TrueKredit"
                    width={sidebarCollapsed ? 40 : 80}
                    height={sidebarCollapsed ? 40 : 18}
                    className={cn(
                      "object-contain opacity-40 hover:opacity-60 transition-opacity",
                      sidebarCollapsed ? "h-10 w-10" : "h-4 w-auto",
                    )}
                  />
                ) : (
                  <div className={sidebarCollapsed ? "h-10 w-10" : "h-4 w-[80px]"} />
                )}
              </a>
              </div>
              {!sidebarCollapsed && (
                <span className="text-[10px] font-medium text-muted-foreground/50 shrink-0">
                  v{APP_VERSION}
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className={cn(
          "min-h-screen bg-background transition-[padding] duration-200 ease-in-out",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64",
        )}>
          {/* Top bar */}
          <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-sm border-b border-border">
            <div className="flex items-center justify-between h-full px-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <Breadcrumbs
                  className="hidden sm:flex"
                  tenantName={membership?.tenantName}
                />
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <span className="text-sm text-muted">{user.email}</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main
            id="dashboard-main"
            className="w-full min-w-0 p-4 sm:p-5 md:px-6 md:py-6 lg:px-7 lg:py-8 xl:px-9 xl:py-8 2xl:px-11"
          >
            {children}
          </main>
        </div>
      </div>
    </TenantProvider>
  );
}
