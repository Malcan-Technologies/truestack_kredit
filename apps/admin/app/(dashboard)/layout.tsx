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
  Wallet,
  Package,
  ClipboardList,
  Menu,
  X,
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
  Layers,
  Phone,
  Store,
  Blocks,
  Send,
  Fingerprint,
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
import { TenantSwitcher } from "@/components/tenant-switcher";
import { TenantProvider } from "@/components/tenant-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AccessDeniedCard } from "@/components/role-gate";
import { canAccessPage } from "@/lib/permissions";
import { api } from "@/lib/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { NoTenantPrompt } from "@/components/no-tenant-prompt";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

interface Membership {
  role: string;
  roleId?: string | null;
  roleName?: string;
  permissions?: string[];
  tenantName?: string;
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
      { name: "Billing", href: "/dashboard/billing", icon: Wallet },
      { name: "Plan", href: "/dashboard/plan", icon: Layers },
      { name: "Promotions", href: "/dashboard/promotions", icon: Megaphone },
      { name: "Admin Logs", href: "/dashboard/admin-logs", icon: ScrollText },
      { name: "Roles & Access", href: "/dashboard/roles", icon: Lock },
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
  "/dashboard/billing",
  "/dashboard/plan",
  "/dashboard/promotions",
  "/dashboard/debt-marketplace",
  "/dashboard/calculator",
  "/dashboard/admin-logs",
  "/dashboard/subscription",
  "/dashboard/add-ons",
  "/dashboard/modules",
  "/dashboard/roles",
];

// Paths that require PAID subscription; FREE users can only access dashboard, billing, plan, promotions, help, settings, and subscription (to subscribe)
const PATHS_REQUIRING_PAID = [
  "/dashboard/borrowers",
  "/dashboard/products",
  "/dashboard/applications",
  "/dashboard/loans",
  "/dashboard/compliance",
  "/dashboard/calculator",
  "/dashboard/reports",
  "/dashboard/admin-logs",
  "/dashboard/add-ons",
  "/dashboard/modules",
];

const SECURITY_PATHS = new Set(["/dashboard/profile", "/dashboard/security-setup"]);

function pathRequiresMembership(href: string): boolean {
  return PATHS_REQUIRING_MEMBERSHIP.some((p) => href === p || href.startsWith(p + "/"));
}

function pathRequiresPaid(href: string): boolean {
  return PATHS_REQUIRING_PAID.some((p) => href === p || href.startsWith(p + "/"));
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
  const [subscriptionStatus, setSubscriptionStatus] = useState<'FREE' | 'PAID' | 'OVERDUE' | 'SUSPENDED'>('FREE');
  const [hasTenants, setHasTenants] = useState<boolean>(true);
  const [membershipCheckComplete, setMembershipCheckComplete] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<"loading" | "complete" | "incomplete" | "error">("loading");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedNavGroups, setExpandedNavGroups] = useState<Record<string, boolean>>({
    "/dashboard/modules": false,
  });
  const [applicationsPendingCount, setApplicationsPendingCount] = useState(0);
  const [loansPendingDisbursementCount, setLoansPendingDisbursementCount] = useState(0);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const memberPermissions = membership?.permissions ?? [];

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
    // Redirect to login if not authenticated
    if (!isPending && !session) {
      router.push("/login");
      return;
    }

    // Ensure active tenant is set and fetch membership info
    if (session) {
      ensureActiveTenantAndFetchMembership();
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setSecurityStatus("complete");
      return;
    }

    let cancelled = false;

    setSecurityStatus("loading");

    void fetchSecurityStatus(session.user as { emailVerified?: boolean; twoFactorEnabled?: boolean })
      .then((status) => {
        if (cancelled) return;
        setSecurityStatus(status.isSecuritySetupComplete ? "complete" : "incomplete");
      })
      .catch(() => {
        if (cancelled) return;
        setSecurityStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [session, isPending]);

  useEffect(() => {
    if (isPending || !session || securityStatus === "loading") return;

    const isSecurityPath = SECURITY_PATHS.has(pathname);
    if (isSecurityPath) return;

    if (securityStatus === "incomplete" || securityStatus === "error") {
      router.replace(`/dashboard/security-setup?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [session, isPending, pathname, router, securityStatus]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/modules")) {
      setExpandedNavGroups((prev) => ({ ...prev, "/dashboard/modules": true }));
    }
  }, [pathname]);

  const fetchApplicationsPendingCount = useCallback(async () => {
    if (
      !hasTenants ||
      subscriptionStatus === "FREE" ||
      subscriptionStatus === "SUSPENDED" ||
      !canAccessPage(memberPermissions, "/dashboard/applications")
    ) {
      setApplicationsPendingCount(0);
      return;
    }
    api
      .get<{
        actionableTotal: number;
        submitted?: number;
        underReview?: number;
        pendingL2Approval?: number;
      }>("/api/loans/applications/counts")
      .then((res) => {
        if (res.success && res.data) {
          setApplicationsPendingCount(res.data.actionableTotal ?? 0);
        }
      })
      .catch(() => setApplicationsPendingCount(0));
  }, [hasTenants, subscriptionStatus, memberPermissions]);

  // Fetch applications pending count on mount and when count may have changed
  useEffect(() => {
    fetchApplicationsPendingCount();
  }, [fetchApplicationsPendingCount]);

  const fetchLoansPendingDisbursementCount = useCallback(async () => {
    if (
      !hasTenants ||
      subscriptionStatus !== "PAID" ||
      !canAccessPage(memberPermissions, "/dashboard/loans")
    ) {
      setLoansPendingDisbursementCount(0);
      return;
    }
    api
      .get<{ pendingDisbursement: number }>("/api/loans/counts")
      .then((res) => {
        if (res.success && res.data) {
          setLoansPendingDisbursementCount(res.data.pendingDisbursement);
        }
      })
      .catch(() => setLoansPendingDisbursementCount(0));
  }, [hasTenants, subscriptionStatus, memberPermissions]);

  // Fetch loans pending disbursement count on mount and when count may have changed
  useEffect(() => {
    fetchLoansPendingDisbursementCount();
  }, [fetchLoansPendingDisbursementCount]);

  // Listen for count changes (approve, reject, return-to-draft on application detail)
  useEffect(() => {
    const handler = () => fetchApplicationsPendingCount();
    window.addEventListener("applications-count-changed", handler);
    return () => window.removeEventListener("applications-count-changed", handler);
  }, [fetchApplicationsPendingCount]);

  // Listen for loans count changes (disburse on loan detail, approve on application detail)
  useEffect(() => {
    const handler = () => fetchLoansPendingDisbursementCount();
    window.addEventListener("loans-count-changed", handler);
    return () => window.removeEventListener("loans-count-changed", handler);
  }, [fetchLoansPendingDisbursementCount]);

  const ensureActiveTenantAndFetchMembership = async () => {
    try {
      const membershipsRes = await fetch("/api/proxy/auth/memberships", {
        credentials: "include",
      });

      if (membershipsRes.status === 401) {
        setMembership({ role: "NONE", permissions: [], tenantName: undefined });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      let membershipsData: { success?: boolean; data?: { memberships?: unknown[]; activeTenantId?: string } };
      try {
        membershipsData = await membershipsRes.json();
      } catch {
        setMembership({ role: "NONE", permissions: [], tenantName: undefined });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      if (
        !membershipsData.success ||
        !membershipsData.data?.memberships?.length
      ) {
        setMembership({ role: "NONE", permissions: [], tenantName: undefined });
        setHasTenants(false);
        setMembershipCheckComplete(true);
        return;
      }

      setHasTenants(true);

      if (!membershipsData.data.activeTenantId) {
        const firstTenant = membershipsData.data.memberships[0] as { tenantId: string; role: string; tenantName?: string };
        await fetch("/api/proxy/auth/switch-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantId: firstTenant.tenantId }),
        });
        const meAfterSwitch = await fetch("/api/proxy/auth/me", { credentials: "include" });
        if (meAfterSwitch.ok) {
          const meJson = await meAfterSwitch.json();
          if (meJson.success && meJson.data?.user) {
            const u = meJson.data.user;
            setMembership({
              role: u.role,
              roleId: u.roleId ?? null,
              roleName: u.roleName,
              permissions: u.permissions ?? [],
              tenantName: firstTenant.tenantName ?? u.tenantName,
            });
            const status = meJson.data.tenant?.subscriptionStatus;
            if (status === "PAID" || status === "OVERDUE" || status === "SUSPENDED") {
              setSubscriptionStatus(status);
            } else {
              setSubscriptionStatus("FREE");
            }
            setMembershipCheckComplete(true);
            return;
          }
        }
        setMembership({
          role: firstTenant.role,
          permissions: [],
          tenantName: firstTenant.tenantName,
        });
        setMembershipCheckComplete(true);
        return;
      }

      const activeMembership = (membershipsData.data.memberships as { tenantId: string; tenantName?: string }[]).find(
        (m) => m.tenantId === membershipsData.data!.activeTenantId,
      );

      const response = await fetch("/api/proxy/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const u = data.data.user;
          setMembership({
            role: u.role,
            roleId: u.roleId ?? null,
            roleName: u.roleName,
            permissions: u.permissions ?? [],
            tenantName:
              activeMembership?.tenantName || u.tenantName,
          });
          const status = data.data.tenant?.subscriptionStatus;
          if (status === "PAID" || status === "OVERDUE" || status === "SUSPENDED") {
            setSubscriptionStatus(status);
          } else {
            setSubscriptionStatus("FREE");
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch membership:", error);
      setMembership({ role: "NONE", permissions: [], tenantName: undefined });
      setHasTenants(false);
    } finally {
      setMembershipCheckComplete(true);
    }
  };

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

  if (securityStatus === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const user = session.user;

  const pathRequiresMembershipCheck = PATHS_REQUIRING_MEMBERSHIP.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const pathRequiresPaidCheck = pathRequiresPaid(pathname);
  if (!hasTenants && pathRequiresMembershipCheck) {
    notFound();
  }
  if ((subscriptionStatus === "FREE" || subscriptionStatus === "SUSPENDED") && pathRequiresPaidCheck) {
    notFound();
  }

  const hasCurrentPathAccess = canAccessPage(memberPermissions, pathname);

  return (
    <TenantProvider
      role={membership?.role || "GENERAL_STAFF"}
      roleName={membership?.roleName}
      roleId={membership?.roleId ?? null}
      permissions={membership?.permissions}
      hasTenants={hasTenants}
      subscriptionStatus={subscriptionStatus}
    >
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
            {/* Tenant Switcher (top of sidebar) */}
            <TenantSwitcher collapsed={sidebarCollapsed} />
            {!sidebarCollapsed && (
              <div className="flex items-center justify-end px-2 lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}

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
                            const hasAccess = canAccessPage(memberPermissions, child.href);
                            const requiresMembership = pathRequiresMembership(child.href);
                            const requiresPaid = pathRequiresPaid(child.href);
                            const disabledNoMembership = !hasTenants && requiresMembership;
                            const disabledFreeSubscription = subscriptionStatus === "FREE" && requiresPaid;

                            return {
                              ...child,
                              isChildActive,
                              disabled: !hasAccess || disabledNoMembership || disabledFreeSubscription,
                              disabledNoMembership,
                              disabledFreeSubscription,
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
                            pathname.startsWith(item.href)) ||
                          // Plan: also highlight when on subscription or payment pages
                          (item.href === "/dashboard/plan" &&
                            pathname.startsWith("/dashboard/subscription"));
                        const hasAccess = canAccessPage(memberPermissions, item.href);
                        const requiresMembership = pathRequiresMembership(item.href);
                        const requiresPaid = pathRequiresPaid(item.href);
                        const disabledNoMembership = !hasTenants && requiresMembership;
                        const disabledFreeSubscription =
                          (subscriptionStatus === "FREE" || subscriptionStatus === "SUSPENDED") && requiresPaid;

                        if (!hasAccess || disabledNoMembership || disabledFreeSubscription) {
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
                                      ? "Create or join a tenant to access"
                                      : disabledFreeSubscription
                                      ? "Upgrade to access"
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
                                {isLoans && loansPendingDisbursementCount > 0 && (
                                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
                                    {loansPendingDisbursementCount}
                                  </Badge>
                                )}
                              </>
                            )}
                            {sidebarCollapsed && isApplications && applicationsPendingCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {applicationsPendingCount > 99 ? "99+" : applicationsPendingCount}
                              </span>
                            )}
                            {sidebarCollapsed && isLoans && loansPendingDisbursementCount > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                                {loansPendingDisbursementCount > 99 ? "99+" : loansPendingDisbursementCount}
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
                                {isLoans && loansPendingDisbursementCount > 0 && (
                                  <p className="opacity-70 text-xs mt-1">
                                    {loansPendingDisbursementCount} pending disbursement
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
                            {membership?.roleName || membership?.role || "Member"}
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
          <main id="dashboard-main" className="p-4 lg:p-8">
            {hasCurrentPathAccess ? children : <AccessDeniedCard />}
          </main>
        </div>
      </div>
    </TenantProvider>
  );
}
