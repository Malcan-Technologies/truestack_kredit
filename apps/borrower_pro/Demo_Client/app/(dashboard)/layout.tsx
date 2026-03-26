"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetchBorrowerMe, BORROWER_PROFILE_SWITCHED_EVENT } from "@borrower_pro/lib/borrower-auth-client";
import { fetchLoanCenterOverview } from "@borrower_pro/lib/borrower-loans-client";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCircle,
} from "lucide-react";
import { useSession, signOut } from "@borrower_pro/lib/auth-client";
import { Button } from "@borrower_pro/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@borrower_pro/components/ui/dropdown-menu";
import { AppDropdownMenuContent } from "@borrower_pro/components/ui/app-dropdown-menu";
import { BorrowerSwitcher } from "@borrower_pro/components/borrower-switcher";
import { NavbarCorner } from "@borrower_pro/components/navbar-corner";
import { SidebarLenderBranding } from "@borrower_pro/components/sidebar-lender-branding";
import { ThemeToggle } from "@borrower_pro/components/theme-toggle";
import { Badge } from "@borrower_pro/components/ui/badge";
import { cn } from "@borrower_pro/lib/utils";
import { APP_VERSION } from "@/lib/version";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Applications", href: "/applications", icon: ClipboardList },
  { name: "Loans", href: "/loans", icon: Landmark },
  { name: "Your Profile", href: "/profile", icon: UserCircle },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [beforePayoutCount, setBeforePayoutCount] = useState(0);

  const refreshLoanOverview = useCallback(async () => {
    try {
      const r = await fetchLoanCenterOverview();
      if (r.success && r.data?.counts) {
        setBeforePayoutCount(r.data.counts.pendingDisbursementLoans);
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

  // Redirect to onboarding when no borrower profiles, unless user previously dismissed
  useEffect(() => {
    if (isPending || !session || pathname === "/onboarding") return;
    const dismissed = (() => {
      try { return localStorage.getItem("onboarding_dismissed") === "true"; }
      catch { return false; }
    })();
    if (dismissed) return;
    fetchBorrowerMe()
      .then((res) => {
        if (res.success && res.data.profileCount === 0) {
          router.replace("/onboarding");
        }
      })
      .catch(() => {});
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
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <div className="space-y-3">
              <SidebarLenderBranding />
              <BorrowerSwitcher />
            </div>
          </div>

          <nav className="flex-1 py-4 px-2 space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 min-w-0">{item.name}</span>
                  {item.href === "/loans" && beforePayoutCount > 0 ? (
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 shrink-0 px-1.5 text-xs"
                      title="Loans before payout"
                    >
                      {beforePayoutCount > 99 ? "99+" : beforePayoutCount}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* User menu — matches admin_pro sidebar trigger + dropdown */}
          <div className="border-t border-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left outline-none transition-colors hover:border-foreground/30 hover:bg-secondary focus:ring-0",
                  )}
                  aria-label="Open user menu"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">
                      {user.name || user.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:-rotate-90" />
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

          <div className="border-t border-border py-3 px-4">
            <span className="text-[10px] font-medium text-muted-foreground">
              TrueKredit™ Pro · v{APP_VERSION}
            </span>
          </div>
        </div>
      </aside>

      <div className="relative min-h-screen bg-background lg:pl-64">
        <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-sm border-b border-border">
          <NavbarCorner className="hidden lg:block" />
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
                  : pathname === "/onboarding"
                  ? "Onboarding"
                  : "Demo Client"}
              </h1>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="w-full min-w-0 p-4 sm:p-5 md:px-6 md:py-6 lg:px-7 lg:py-8 xl:px-9 xl:py-8 2xl:px-11">
          {children}
        </main>
      </div>
    </div>
  );
}
