"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronsUpDown, User, Building2, Plus } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import {
  fetchBorrowerMe,
  switchBorrowerProfile,
  dispatchBorrowerProfileSwitched,
  type BorrowerProfile,
} from "../lib/borrower-auth-client";

interface BorrowerSwitcherProps {
  className?: string;
  collapsed?: boolean;
}

function ProfileIcon({ type }: { type: string }) {
  return type === "CORPORATE" ? (
    <Building2 className="h-4 w-4 text-muted" />
  ) : (
    <User className="h-4 w-4 text-muted" />
  );
}

function getProfileDisplayName(profile: BorrowerProfile): string {
  if (profile.borrowerType === "CORPORATE" && profile.companyName?.trim()) {
    return profile.companyName.trim();
  }
  return profile.name || "Select profile";
}

function fetchProfiles() {
  return fetchBorrowerMe().then((res) => {
    if (res.success && res.data) return res.data;
    throw new Error("Failed to fetch profiles");
  });
}

export function BorrowerSwitcher({ className, collapsed }: BorrowerSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<BorrowerProfile[]>([]);
  const [activeBorrower, setActiveBorrower] = useState<BorrowerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchProfiles()
      .then(async (data) => {
        setProfiles(data.profiles);
        setActiveBorrower(data.activeBorrower);
        // Auto-select first profile when none active
        if (data.profiles.length > 0 && !data.activeBorrowerId) {
          try {
            await switchBorrowerProfile(data.profiles[0].id);
            setActiveBorrower(data.profiles[0]);
            router.refresh();
          } catch {
            // Ignore
          }
        }
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [router, pathname]);

  const handleSwitch = async (profile: BorrowerProfile) => {
    if (profile.id === activeBorrower?.id || switching) return;
    setSwitching(true);
    try {
      await switchBorrowerProfile(profile.id);
      setActiveBorrower(profile);
      dispatchBorrowerProfileSwitched(profile.id);
      toast.success(`Switched to ${getProfileDisplayName(profile)}`);
      router.refresh();
    } catch {
      toast.error("Failed to switch profile");
    } finally {
      setSwitching(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center rounded-lg border border-border bg-card/50 px-3 py-2",
          collapsed && "justify-center px-2",
          className
        )}
      >
        {!collapsed && (
          <span className="text-sm text-muted-foreground">Loading...</span>
        )}
      </div>
    );
  }

  // No profiles — show create CTA (layout redirects to onboarding when 0 profiles)
  if (profiles.length === 0) {
    return (
      <Button
        variant="outline"
        className={cn(
          "w-full justify-start gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 h-auto hover:bg-accent",
          collapsed && "justify-center px-2",
          className
        )}
        asChild
      >
        <Link href="/onboarding" className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted" />
          {!collapsed && (
            <span className="text-sm font-medium">Create borrower profile</span>
          )}
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 hover:bg-accent transition-colors text-left",
            collapsed && "justify-center px-2",
            className
          )}
          disabled={switching}
          aria-label="Switch borrower profile"
        >
          <ProfileIcon type={activeBorrower?.borrowerType || "INDIVIDUAL"} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-sm font-medium">
                {activeBorrower ? getProfileDisplayName(activeBorrower) : "Select profile"}
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Switch profile</span>
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 -mr-1 text-xs">
            <Link href="/onboarding" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New profile
            </Link>
          </Button>
        </div>
        <DropdownMenuSeparator />
        {profiles.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => handleSwitch(p)}
            className={cn(
              "cursor-pointer",
              p.id === activeBorrower?.id &&
                "bg-muted/25 focus:bg-muted/25 data-[highlighted]:bg-muted/25"
            )}
          >
            <ProfileIcon type={p.borrowerType} />
            <span className="ml-2 truncate">{getProfileDisplayName(p)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
