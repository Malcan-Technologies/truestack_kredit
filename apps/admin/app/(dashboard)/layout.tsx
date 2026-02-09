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
  BarChart3,
  Menu,
  X,
  HelpCircle,
  ScrollText,
  Calculator,
  CircleDollarSign,
  Shield,
  UserCircle,
  ChevronDown,
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
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
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
      { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
      { name: "Compliance", href: "/dashboard/compliance", icon: Shield },
      { name: "Billing", href: "/dashboard/billing", icon: Wallet },
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
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true);
  }, []);

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
    <TenantProvider>
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
            "fixed top-0 left-0 z-50 h-full w-64 bg-surface border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-border">
              <Link href="/dashboard" className="flex items-center">
                {mounted ? (
                  <Image
                    src={
                      resolvedTheme === "dark"
                        ? "/logo-dark.svg"
                        : "/logo-light.svg"
                    }
                    alt="TrueKredit"
                    width={140}
                    height={32}
                    priority
                    className="h-8 w-auto"
                  />
                ) : (
                  <div className="h-8 w-[140px]" /> // Placeholder to prevent layout shift
                )}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tenant Switcher */}
            <TenantSwitcher />

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 overflow-y-auto">
              {navigationSections.map((section, sectionIndex) => (
                <div
                  key={section.title}
                  className={cn(sectionIndex > 0 && "mt-6")}
                >
                  <p className="px-3 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/dashboard" &&
                          pathname.startsWith(item.href));
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            isActive
                              ? "bg-accent/10 text-accent"
                              : "text-muted hover:text-foreground hover:bg-surface",
                          )}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* User info - dashed outline so it's clear this is a menu trigger */}
            <div className="p-4 border-t border-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="
          group
          flex items-center gap-3 w-full p-2 rounded-lg
          border-2 border-dashed border-primary/50
          hover:border-primary/80 hover:bg-surface
          transition-colors
          outline-none
          focus:ring-2 focus:ring-primary/50
          focus:ring-offset-2 focus:ring-offset-surface
        "
                    aria-label="Open user menu"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-accent flex items-center justify-center text-white font-medium">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </div>

                    {/* User info */}
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
                      className="
            h-4 w-4 shrink-0 text-muted-foreground
            transition-transform duration-200 ease-out
            group-data-[state=open]:-rotate-90
          "
                    />
                  </button>
                </DropdownMenuTrigger>

                {/* Dropdown content */}
                <DropdownMenuContent
                  side="right"
                  align="start"
                  sideOffset={8}
                  alignOffset={-20}
                  className="
        w-56
        border-2 border-dashed border-primary/70
        bg-surface shadow-lg
        duration-200
        data-[state=open]:animate-in
        data-[state=closed]:animate-out
        data-[state=open]:fade-in-0
        data-[state=closed]:fade-out-0
        data-[state=open]:zoom-in-95
        data-[state=closed]:zoom-out-95
        data-[side=right]:slide-in-from-left-2
      "
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
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-64 min-h-screen bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.02]">
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
          <main className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </TenantProvider>
  );
}
