"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  Puzzle,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
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
import { canAccessPage } from "@/lib/permissions";
import type { TenantRole } from "@/lib/permissions";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { ZoomControl } from "@/components/zoom-control";
import { cn } from "@/lib/utils";

interface Membership {
  role: string;
  tenantName?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
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
      { name: "Products", href: "/dashboard/products", icon: Package },
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
      { name: "Compliance", href: "/dashboard/compliance", icon: Shield },
      { name: "Billing", href: "/dashboard/billing", icon: Wallet },
      { name: "Add-ons", href: "/dashboard/add-ons", icon: Puzzle },
      { name: "Promotions", href: "/dashboard/promotions", icon: Megaphone },
    ],
  },
  {
    title: "Tools",
    items: [
      { name: "Calculator", href: "/dashboard/calculator", icon: Calculator },
      { name: "Help", href: "/dashboard/help", icon: HelpCircle },
    ],
  },
  {
    title: "Administration",
    items: [
      { name: "Admin Logs", href: "/dashboard/admin-logs", icon: ScrollText },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const ensureActiveTenantAndFetchMembership = async () => {
    try {
      // Use proxy route for backend calls (ensures cookies work correctly)
      // First, check memberships and ensure active tenant is set
      const membershipsRes = await fetch("/api/proxy/auth/memberships", {
        credentials: "include",
      });
      const membershipsData = await membershipsRes.json();

      if (
        !membershipsData.success ||
        !membershipsData.data?.memberships?.length
      ) {
        console.error("No memberships found");
        return;
      }

      // If no active tenant, set the first one
      if (!membershipsData.data.activeTenantId) {
        const firstTenant = membershipsData.data.memberships[0];
        await fetch("/api/proxy/auth/switch-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tenantId: firstTenant.tenantId }),
        });
        // Set membership from the first tenant
        setMembership({
          role: firstTenant.role,
          tenantName: firstTenant.tenantName,
        });
        return;
      }

      // Active tenant exists, find the active membership and fetch full info
      const activeMembership = membershipsData.data.memberships.find(
        (m: { tenantId: string }) =>
          m.tenantId === membershipsData.data.activeTenantId,
      );

      const response = await fetch("/api/proxy/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMembership({
            role: data.data.user.role,
            tenantName:
              activeMembership?.tenantName || data.data.user.tenantName,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch membership:", error);
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

  const user = session.user;

  return (
    <TenantProvider role={(membership?.role as TenantRole) || "STAFF"}>
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
                        const isActive =
                          pathname === item.href ||
                          (item.href !== "/dashboard" &&
                            pathname.startsWith(item.href));
                        const memberRole = (membership?.role as TenantRole) || "STAFF";
                        const hasAccess = canAccessPage(memberRole, item.href);

                        if (!hasAccess) {
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
                                <TooltipContent side="right">
                                  <p>{item.name}</p>
                                  <p className="opacity-70 text-xs">Locked</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return lockedContent;
                        }

                        const linkContent = (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              "flex items-center rounded-lg text-sm font-medium transition-colors",
                              sidebarCollapsed
                                ? "justify-center px-0 py-2"
                                : "gap-3 px-3 py-2",
                              isActive
                                ? "bg-accent/10 text-accent"
                                : "text-muted hover:text-foreground hover:bg-surface",
                            )}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!sidebarCollapsed && item.name}
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
                      "group flex items-center w-full rounded-lg border-2 border-dashed border-primary/50 hover:border-primary/80 hover:bg-surface transition-colors outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-surface",
                      sidebarCollapsed
                        ? "justify-center p-1.5"
                        : "gap-3 p-2",
                    )}
                    aria-label="Open user menu"
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "rounded-full bg-gradient-accent flex items-center justify-center text-white font-medium shrink-0",
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
                  className="w-56 border-2 border-dashed border-primary/70 bg-surface shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=right]:slide-in-from-left-2"
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
              "border-t border-border py-3 flex flex-col items-center gap-1",
              sidebarCollapsed ? "px-1" : "px-4",
            )}>
              {!sidebarCollapsed && (
                <p className="text-[10px] font-medium text-muted-foreground/50 tracking-wide">
                  Powered by
                </p>
              )}
              <a href="https://truestack.my" target="_blank" rel="noopener noreferrer" className="flex items-center">
                {mounted ? (
                  <Image
                    src={
                      resolvedTheme === "dark"
                        ? "/logo-dark.svg"
                        : "/logo-light.svg"
                    }
                    alt="TrueKredit"
                    width={sidebarCollapsed ? 24 : 80}
                    height={sidebarCollapsed ? 24 : 18}
                    className={cn(
                      "object-contain opacity-40 hover:opacity-60 transition-opacity",
                      sidebarCollapsed ? "h-5 w-5" : "h-4 w-auto",
                    )}
                  />
                ) : (
                  <div className={sidebarCollapsed ? "h-5 w-5" : "h-4 w-[80px]"} />
                )}
              </a>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className={cn(
          "min-h-screen bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.02] transition-[padding] duration-200 ease-in-out",
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
                <ZoomControl />
                <ThemeToggle />
                <span className="text-sm text-muted">{user.email}</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main id="dashboard-main" className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </TenantProvider>
  );
}
