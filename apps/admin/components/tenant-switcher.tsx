"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/components/tenant-context";
import { cn } from "@/lib/utils";

interface Membership {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  tenantLogoUrl: string | null;
  tenantSubscriptionStatus?: "FREE" | "PAID" | "OVERDUE" | "SUSPENDED";
  subscription?: { currentPeriodEnd: string } | null;
  role: string;
}

interface TenantSwitcherProps {
  className?: string;
  collapsed?: boolean;
}

interface TenantLogoProps {
  logoUrl?: string | null;
  name?: string;
  size?: "sm" | "md";
}

function TenantLogo({ logoUrl, name, size = "md" }: TenantLogoProps) {
  const sizeClasses = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  if (logoUrl) {
    return (
      <div className={cn("relative shrink-0 rounded overflow-hidden bg-surface border border-border", sizeClasses)}>
        <Image
          src={logoUrl}
          alt={name || "Tenant logo"}
          fill
          className="object-contain"
        />
      </div>
    );
  }

  return (
    <div className={cn("shrink-0 rounded bg-surface border border-border flex items-center justify-center", sizeClasses)}>
      <Building2 className={cn("text-muted", iconSize)} />
    </div>
  );
}

/** Days until target date (MYT). Positive = future, negative = past. */
function getMytDaysUntil(targetIsoDate: string): number {
  const target = new Date(targetIsoDate);
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const getParts = (d: Date) => {
    const parts = formatter.formatToParts(d);
    return {
      y: parts.find((p) => p.type === "year")?.value ?? "1970",
      m: parts.find((p) => p.type === "month")?.value ?? "01",
      d: parts.find((p) => p.type === "day")?.value ?? "01",
    };
  };
  const nowP = getParts(now);
  const targetP = getParts(target);
  const nowUtc = Date.UTC(Number(nowP.y), Number(nowP.m) - 1, Number(nowP.d));
  const targetUtc = Date.UTC(Number(targetP.y), Number(targetP.m) - 1, Number(targetP.d));
  return Math.ceil((targetUtc - nowUtc) / (1000 * 60 * 60 * 24));
}

type DotStatus = "paid" | "expired" | "overdue" | "free";

function getSubscriptionDotStatus(m: Membership): DotStatus {
  const subStatus = m.tenantSubscriptionStatus;
  if (subStatus === "FREE" || subStatus === "SUSPENDED") return "free";
  const periodEnd = m.subscription?.currentPeriodEnd;
  if (!periodEnd) return subStatus === "PAID" ? "paid" : "free";
  const daysUntil = getMytDaysUntil(periodEnd);
  if (daysUntil > 0) return "paid";
  if (daysUntil >= -14) return "expired";
  return "overdue";
}

function SubscriptionStatusDot({ status }: { status: DotStatus }) {
  const config = {
    paid: { className: "bg-emerald-500", title: "Subscribed" },
    expired: { className: "bg-amber-500", title: "Payment due" },
    overdue: { className: "bg-red-500", title: "Overdue" },
    free: { className: "bg-amber-500", title: "Pending" },
  }[status];
  return (
    <span
      className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", config.className)}
      title={config.title}
    />
  );
}

export function TenantSwitcher({ className, collapsed = false }: TenantSwitcherProps) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const { refreshKey } = useTenantContext();

  useEffect(() => {
    fetchMemberships();
  }, [refreshKey]);

  const fetchMemberships = async () => {
    try {
      // Use proxy route for backend calls (ensures cookies work correctly)
      const response = await fetch("/api/proxy/auth/memberships", {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setMemberships(data.data.memberships);
        
        // If no active tenant but memberships exist, set the first one
        if (!data.data.activeTenantId && data.data.memberships.length > 0) {
          const firstTenant = data.data.memberships[0];
          await fetch("/api/proxy/auth/switch-tenant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ tenantId: firstTenant.tenantId }),
          });
          setActiveTenantId(firstTenant.tenantId);
        } else {
          setActiveTenantId(data.data.activeTenantId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch memberships:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === activeTenantId || switching) return;

    setSwitching(true);
    try {
      // Use proxy route for backend calls
      const response = await fetch("/api/proxy/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId }),
      });

      const data = await response.json();

      if (data.success) {
        setActiveTenantId(tenantId);
        toast.success(`Switched to ${data.data.tenantName}`);
        // Reload the page to refresh all data with new tenant context
        window.location.reload();
      } else {
        toast.error(data.error || "Failed to switch tenant");
      }
    } catch (error) {
      toast.error("Failed to switch tenant");
    } finally {
      setSwitching(false);
    }
  };

  const activeMembership = memberships.find(
    (m) => m.tenantId === activeTenantId
  );

  // Loading state
  if (loading) {
    if (collapsed) {
      return (
        <div className={cn("flex items-center justify-center h-16", className)}>
          <div className="h-8 w-8 bg-surface animate-pulse rounded" />
        </div>
      );
    }
    return (
      <div className={cn("px-4 py-3", className)}>
        <div className="h-5 w-32 bg-surface animate-pulse rounded" />
        <div className="h-4 w-24 bg-surface animate-pulse rounded mt-1" />
      </div>
    );
  }

  // Collapsed mode — always show dropdown (for Create New Tenant access)
  if (collapsed) {
    return (
      <>
        <DropdownMenu>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <DropdownMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-center w-full h-16 hover:bg-surface transition-colors outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
                      className,
                    )}
                    disabled={switching}
                    aria-label="Switch tenant"
                  >
                    <TenantLogo
                      logoUrl={activeMembership?.tenantLogoUrl}
                      name={activeMembership?.tenantName}
                    />
                  </button>
                </TooltipTrigger>
              </DropdownMenuTrigger>
              <TooltipContent side="right">
                <p>{activeMembership?.tenantName || "Select tenant"}</p>
                <p className="flex items-center gap-1.5 opacity-70 text-xs mt-0.5">
                  <SubscriptionStatusDot status={activeMembership ? getSubscriptionDotStatus(activeMembership) : "free"} />
                  {activeMembership?.tenantSlug || ""}
                  {memberships.length > 1 ? " · Click to switch" : " · Click for options"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent className="w-[320px]" side="right" align="start">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-semibold">Switch Tenant</span>
              <Button variant="ghost" size="sm" asChild className="h-7 px-2 -mr-1 text-xs">
                <Link href="/dashboard/onboarding" className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Tenant
                </Link>
              </Button>
            </div>
            <DropdownMenuSeparator />
            {memberships.map((membership) => (
              <DropdownMenuItem
                key={membership.tenantId}
                onClick={() => handleSwitchTenant(membership.tenantId)}
                className={cn(
                  "cursor-pointer",
                  membership.tenantId === activeTenantId &&
                    "bg-muted/10 focus:bg-muted/10 data-[highlighted]:bg-muted/10"
                )}
              >
                <div className="flex items-center w-full gap-2 min-w-0">
                  <TenantLogo
                    logoUrl={membership.tenantLogoUrl}
                    name={membership.tenantName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-sm font-medium min-w-0">
                      <span className="truncate block">{membership.tenantName}</span>
                    </p>
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                      <span className="text-xs text-muted min-w-0 flex items-center gap-1.5">
                        <SubscriptionStatusDot status={getSubscriptionDotStatus(membership)} />
                        <span className="truncate">{membership.tenantSlug}</span>
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                        {membership.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  }

  // Expanded mode — always show dropdown (for Create New Tenant access)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between px-4 py-6 h-auto rounded-none hover:bg-surface hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
            className
          )}
          disabled={switching}
        >
          <div className="flex items-center gap-3 min-w-0">
                <TenantLogo
                  logoUrl={activeMembership?.tenantLogoUrl}
                  name={activeMembership?.tenantName}
                />
            <div className="text-left min-w-0">
              <p className="text-sm font-medium truncate">
                {activeMembership?.tenantName || "Select tenant"}
              </p>
              <p className="text-xs text-muted flex items-center gap-1.5 min-w-0">
                <SubscriptionStatusDot status={activeMembership ? getSubscriptionDotStatus(activeMembership) : "free"} />
                <span className="truncate">{activeMembership?.tenantSlug || ""}</span>
              </p>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[320px]" side="right" align="start">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Switch Tenant</span>
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 -mr-1 text-xs">
            <Link href="/dashboard/onboarding" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Tenant
            </Link>
          </Button>
        </div>
        <DropdownMenuSeparator />
        {memberships.length > 0 ? (
          memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.tenantId}
            onClick={() => handleSwitchTenant(membership.tenantId)}
            className={cn(
              "cursor-pointer",
              membership.tenantId === activeTenantId &&
                "bg-muted/25 focus:bg-muted/25 data-[highlighted]:bg-muted/25"
            )}
          >
            <div className="flex items-center w-full gap-2 min-w-0">
              <TenantLogo
                logoUrl={membership.tenantLogoUrl}
                name={membership.tenantName}
                size="sm"
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-sm font-medium min-w-0">
                  <span className="truncate block">{membership.tenantName}</span>
                </p>
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  <span className="text-xs text-muted min-w-0 flex items-center gap-1.5">
                    <SubscriptionStatusDot status={getSubscriptionDotStatus(membership)} />
                    <span className="truncate">{membership.tenantSlug}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                    {membership.role}
                  </Badge>
                </div>
              </div>
            </div>
          </DropdownMenuItem>
        ))
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No tenants yet
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
