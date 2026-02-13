"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

export function TenantSwitcher({ className, collapsed = false }: TenantSwitcherProps) {
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

  // Collapsed mode — show just the tenant logo (clickable if multiple tenants)
  if (collapsed) {
    if (memberships.length <= 1) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn("flex items-center justify-center h-16", className)}>
                <TenantLogo logoUrl={activeMembership?.tenantLogoUrl} name={activeMembership?.tenantName} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{activeMembership?.tenantName || "No tenant"}</p>
              <p className="opacity-70 text-xs">{activeMembership?.tenantSlug || ""}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Multiple tenants — collapsed dropdown
    return (
      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-center w-full h-16 hover:bg-surface transition-colors outline-none",
                    className,
                  )}
                  disabled={switching}
                  aria-label="Switch tenant"
                >
                  <TenantLogo logoUrl={activeMembership?.tenantLogoUrl} name={activeMembership?.tenantName} />
                </button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="right">
              <p>{activeMembership?.tenantName || "Select tenant"}</p>
              <p className="opacity-70 text-xs">Click to switch</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent className="w-[240px]" side="right" align="start">
          <DropdownMenuLabel>Switch Tenant</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.tenantId}
              onClick={() => handleSwitchTenant(membership.tenantId)}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between w-full gap-2">
                <TenantLogo logoUrl={membership.tenantLogoUrl} name={membership.tenantName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {membership.tenantName}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted truncate">
                      {membership.tenantSlug}
                    </p>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {membership.role}
                    </Badge>
                  </div>
                </div>
                {membership.tenantId === activeTenantId && (
                  <Check className="h-4 w-4 text-foreground shrink-0" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Expanded mode — single tenant static display
  if (memberships.length <= 1) {
    return (
      <div className={cn("px-4 py-3 flex items-center gap-3", className)}>
        <TenantLogo logoUrl={activeMembership?.tenantLogoUrl} name={activeMembership?.tenantName} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {activeMembership?.tenantName || "No tenant"}
          </p>
          <p className="text-xs text-muted truncate">
            {activeMembership?.tenantSlug || ""}
          </p>
        </div>
      </div>
    );
  }

  // Expanded mode — multiple tenants switcher
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between px-4 py-6 h-auto rounded-none hover:bg-surface hover:text-foreground",
            className
          )}
          disabled={switching}
        >
          <div className="flex items-center gap-3 min-w-0">
            <TenantLogo logoUrl={activeMembership?.tenantLogoUrl} name={activeMembership?.tenantName} />
            <div className="text-left min-w-0">
              <p className="text-sm font-medium truncate">
                {activeMembership?.tenantName || "Select tenant"}
              </p>
              <p className="text-xs text-muted truncate">
                {activeMembership?.tenantSlug || ""}
              </p>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]" side="right" align="start">
        <DropdownMenuLabel>Switch Tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.tenantId}
            onClick={() => handleSwitchTenant(membership.tenantId)}
            className="cursor-pointer"
          >
            <div className="flex items-center justify-between w-full gap-2">
              <TenantLogo logoUrl={membership.tenantLogoUrl} name={membership.tenantName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {membership.tenantName}
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted truncate">
                    {membership.tenantSlug}
                  </p>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {membership.role}
                  </Badge>
                </div>
              </div>
              {membership.tenantId === activeTenantId && (
                <Check className="h-4 w-4 text-foreground shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
