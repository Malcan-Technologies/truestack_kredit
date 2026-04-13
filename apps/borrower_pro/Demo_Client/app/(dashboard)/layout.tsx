"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  consumePendingAcceptInvitationPath,
  fetchBorrowerMe,
  BORROWER_PROFILE_SWITCHED_EVENT,
} from "@borrower_pro/lib/borrower-auth-client";
import { fetchLoanCenterOverview } from "@borrower_pro/lib/borrower-loans-client";
import Link from "next/link";
import {
  Building2,
  CircleHelp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCircle,
} from "lucide-react";
import { fetchSecurityStatus, useSession, signOut } from "@/lib/auth-client";
import { Button } from "@borrower_pro/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@borrower_pro/components/ui/dropdown-menu";
import { AppDropdownMenuContent } from "@borrower_pro/components/ui/app-dropdown-menu";
import { BorrowerSwitcher } from "@borrower_pro/components/borrower-switcher";
import { SidebarLenderBranding } from "@borrower_pro/components/sidebar-lender-branding";
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";
import { Badge } from "@borrower_pro/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@borrower_pro/components/ui/tooltip";
import { cn } from "@borrower_pro/lib/utils";
import { SecuritySetupBanner } from "@borrower_pro/components/security-setup-banner";
import { APP_VERSION } from "@/lib/version";
import { ONBOARDING_DISMISSED_KEY } from "@borrower_pro/lib/onboarding-storage-keys";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Applications", href: "/applications", icon: ClipboardList },
  { name: "Loans", href: "/loans", icon: Landmark },
  { name: "Your Profile", href: "/profile", icon: UserCircle },
  { name: "Help", href: "/help", icon: CircleHelp },
];

const PROFILE_REQUIRED_NAV_PATHS = new Set(["/applications", "/loans", "/profile"]);

function isOnboardingExemptPath(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname === "/account" ||
    pathname === "/about" ||
    pathname === "/onboarding" ||
    pathname === "/security-setup" ||
    pathname === "/accept-invitation" ||
    pathname.startsWith("/help")
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<"loading" | "complete" | "incomplete" | "error">("loading");
  const [hasBorrowerProfiles, setHasBorrowerProfiles] = useState<boolean | null>(null);
  /** Matches loan center "All" tab: active + before payout + discharged */
  const [allLoansCount, setAllLoansCount] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar-collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      /* ignore */
    }
  };

  const refreshLoanOverview = useCallback(async () => {
    try {
      const r = await fetchLoanCenterOverview();
      if (r.success && r.data?.counts) {
        const c = r.data.counts;
        setAllLoansCount(c.activeLoans + c.pendingDisbursementLoans + c.dischargedLoans);
      }
    } catch {
      /* sidebar stays usable without badge */
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
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

  // Passkey / 2FA are optional: no redirect to security-setup (see SecuritySetupBanner).

  // Redirect to onboarding when no borrower profiles, unless user previously dismissed
  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setHasBorrowerProfiles(null);
      return;
    }
    const dismissed = (() => {
      try { return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true"; }
      catch { return false; }
    })();
    let cancelled = false;

    fetchBorrowerMe()
      .then((res) => {
        if (!res.success || cancelled) return;
        const nextHasProfiles = res.data.profileCount > 0;
        setHasBorrowerProfiles(nextHasProfiles);
        if (!nextHasProfiles && !dismissed && !isOnboardingExemptPath(pathname)) {
          const pendingInvite = consumePendingAcceptInvitationPath();
          if (pendingInvite) {
            router.replace(pendingInvite);
            return;
          }
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasBorrowerProfiles(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, isPending, pathname, router]);

  useEffect(() => {
    if (!session) return;
    void refreshLoanOverview();
  }, [session, pathname, refreshLoanOverview]);

  useEffect(() => {
    const onSwitch = () => void refreshLoanOverview();
    window.addEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
    return () => window.removeEventListener(BORROWER_PROFILE_SWITCHED_EVENT, onSwitch);
  }, [refreshLoanOverview]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
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

  const showSecurityBanner =
    securityStatus === "incomplete" || securityStatus === "error";

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-card border-r border-border transform transition-all duration-200 ease-in-out lg:translate-x-0",
          sidebarCollapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div
            className={cn(
              "border-b border-border shrink-0",
              sidebarCollapsed ? "px-1 py-2 flex flex-col items-center gap-2" : "p-4 space-y-3"
            )}
          >
            <SidebarLenderBranding collapsed={sidebarCollapsed} />
            <BorrowerSwitcher collapsed={sidebarCollapsed} />
          </div>

          <nav
            className={cn(
              "flex-1 py-4 overflow-y-auto space-y-1",
              sidebarCollapsed ? "px-1" : "px-2"
            )}
          >
            <TooltipProvider delayDuration={0}>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const isDisabled = hasBorrowerProfiles === false && PROFILE_REQUIRED_NAV_PATHS.has(item.href);
                const itemClasses = cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors",
                  sidebarCollapsed
                    ? "justify-center px-0 py-2 relative"
                    : "gap-3 px-3 py-2",
                  isDisabled
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                );
                const linkInner = isDisabled ? (
                  <div
                    aria-disabled="true"
                    className={itemClasses}
                    title="Complete onboarding to unlock this page."
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 min-w-0">{item.name}</span>
                        {item.href === "/loans" && allLoansCount > 0 ? (
                          <Badge
                            variant="secondary"
                            className="h-5 min-w-5 shrink-0 px-1.5 text-xs opacity-50"
                            title="Total loans (All)"
                          >
                            {allLoansCount > 99 ? "99+" : allLoansCount}
                          </Badge>
                        ) : null}
                      </>
                    )}
                    {sidebarCollapsed && item.href === "/loans" && allLoansCount > 0 ? (
                      <span className="absolute right-0.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary/50 px-1 text-[10px] font-medium leading-none">
                        {allLoansCount > 9 ? "9+" : allLoansCount}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      itemClasses
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1 min-w-0">{item.name}</span>
                        {item.href === "/loans" && allLoansCount > 0 ? (
                          <Badge
                            variant="secondary"
                            className="h-5 min-w-5 shrink-0 px-1.5 text-xs"
                            title="Total loans (All)"
                          >
                            {allLoansCount > 99 ? "99+" : allLoansCount}
                          </Badge>
                        ) : null}
                      </>
                    )}
                    {sidebarCollapsed && item.href === "/loans" && allLoansCount > 0 ? (
                      <span className="absolute right-0.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-medium leading-none">
                        {allLoansCount > 9 ? "9+" : allLoansCount}
                      </span>
                    ) : null}
                  </Link>
                );

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkInner}</TooltipTrigger>
                      <TooltipContent side="right" className={isDisabled ? "max-w-xs" : undefined}>
                        <p>{item.name}</p>
                        {isDisabled ? (
                          <p className="opacity-70 text-xs mt-1">
                            Complete onboarding to unlock this page.
                          </p>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return <div key={item.href}>{linkInner}</div>;
              })}
            </TooltipProvider>
          </nav>

          {/* Collapse toggle — same pattern as admin_pro dashboard layout */}
          <div
            className={cn(
              "border-t border-border shrink-0",
              sidebarCollapsed ? "px-1 py-2" : "px-2 py-2"
            )}
          >
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-full"
                    onClick={toggleSidebarCollapse}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {sidebarCollapsed ? (
                      <ChevronsRight className="h-4 w-4" />
                    ) : (
                      <ChevronsLeft className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                {sidebarCollapsed ? (
                  <TooltipContent side="right">
                    <p>Expand sidebar</p>
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* User menu — matches admin_pro sidebar trigger + dropdown */}
          <div className={cn("border-t border-border", sidebarCollapsed ? "p-2" : "p-4")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "group flex w-full items-center rounded-lg border border-border text-left outline-none transition-colors hover:border-foreground/30 hover:bg-secondary focus:ring-0",
                    sidebarCollapsed ? "justify-center p-1.5" : "gap-3 p-2",
                  )}
                  aria-label="Open user menu"
                >
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground",
                      sidebarCollapsed ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm",
                    )}
                  >
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium">
                          {user.name || user.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:-rotate-90" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>

              <AppDropdownMenuContent
                side="right"
                align="start"
                sideOffset={8}
                alignOffset={-20}
                className="w-56"
              >
                <DropdownMenuItem onClick={() => router.push("/account")}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/about")}>
                  <Building2 className="mr-2 h-4 w-4" />
                  About
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </AppDropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className={cn(
              "border-t border-border py-3 flex flex-row items-center gap-2",
              sidebarCollapsed ? "px-1 justify-center" : "px-4 justify-between",
            )}
          >
            {!sidebarCollapsed && (
              <span className="text-[10px] font-medium text-muted-foreground">
                TrueKredit™ Pro · v{APP_VERSION}
              </span>
            )}
            {sidebarCollapsed && (
              <span className="text-[10px] font-medium text-muted-foreground/80" title={`v${APP_VERSION}`}>
                v{APP_VERSION}
              </span>
            )}
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "relative min-h-screen bg-background transition-[padding] duration-200 ease-in-out",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64",
        )}
      >
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
              <h1 className="text-lg font-semibold">
                {pathname === "/dashboard"
                  ? "Dashboard"
                  : pathname === "/profile"
                  ? "Your Profile"
                  : pathname === "/account"
                  ? "My account"
                  : pathname === "/applications"
                  ? "Applications"
                  : pathname === "/loans"
                  ? "Loans"
                  : pathname === "/about"
                  ? "About"
                  : pathname.startsWith("/help")
                  ? "Help Center"
                  : pathname === "/onboarding"
                  ? "Onboarding"
                  : "Demo Client"}
              </h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        {pathname !== "/security-setup" ? (
          <SecuritySetupBanner visible={showSecurityBanner} />
        ) : null}

        <main className="w-full min-w-0 p-4 sm:p-5 md:px-6 md:py-6 lg:px-7 lg:py-8 xl:px-9 xl:py-8 2xl:px-11">
          {children}
        </main>
      </div>
    </div>
  );
}
