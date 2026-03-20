"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetchBorrowerMe } from "../../../lib/borrower-auth-client";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  UserCircle,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { BorrowerSwitcher } from "../../../components/borrower-switcher";
import { NavbarCorner } from "../../../components/navbar-corner";
import { ThemeToggle } from "../../../components/theme-toggle";
import { cn } from "@/lib/utils";
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
            <BorrowerSwitcher />
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
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-2 hover:bg-secondary transition-colors text-left"
                  aria-label="Account menu"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium">
                    {user.name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.name || user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right" className="w-56">
                <DropdownMenuItem onClick={() => router.push("/account")}>
                  <UserCircle className="h-4 w-4 mr-2" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/about")}>
                  <Building2 className="h-4 w-4 mr-2" />
                  About
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="border-t border-border py-3 px-4">
            <span className="text-[10px] font-medium text-muted-foreground">
              TrueKredit™ Pro · v{APP_VERSION}
            </span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64 relative">
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

        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
