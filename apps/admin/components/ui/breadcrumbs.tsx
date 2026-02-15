"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Route configuration for breadcrumb labels
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  borrowers: "Borrowers",
  new: "New",
  loans: "Loans",
  products: "Loan Products",
  applications: "Applications",
  reports: "Reports",
  billing: "Billing",
  settings: "Settings",
  help: "Help",
  "admin-logs": "Admin Logs",
  "add-ons": "Add-ons",
  plan: "Plan",
};

interface BreadcrumbItem {
  label: string;
  href: string;
  isLast: boolean;
}

interface BreadcrumbsProps {
  className?: string;
  tenantName?: string | null;
}

export function Breadcrumbs({ className, tenantName }: BreadcrumbsProps) {
  const pathname = usePathname();

  // Parse the pathname into breadcrumb items
  const segments = pathname.split("/").filter(Boolean);
  
  const breadcrumbs: BreadcrumbItem[] = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const isLast = index === segments.length - 1;
    
    // Check if this segment is a dynamic ID (UUID-like)
    const isId = /^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f-]{36}$/i.test(segment);
    
    let label = ROUTE_LABELS[segment] || segment;
    
    // For IDs, show "Details" instead of the raw ID
    if (isId) {
      label = "Details";
    }
    
    return { label, href, isLast };
  });

  // Filter out the first "dashboard" segment from display but keep it in links
  const displayBreadcrumbs = breadcrumbs.slice(1);

  // On dashboard home, just show tenant name
  const isOnDashboardHome = pathname === "/dashboard";

  return (
    <nav className={cn("flex items-center text-base", className)} aria-label="Breadcrumb">
      <ol className="flex items-center gap-1">
        {/* Tenant name as first breadcrumb item */}
        <li>
          <Link 
            href="/dashboard" 
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Building2 className="h-4 w-4 text-foreground" />
            {tenantName && (
              <span className={cn(
                "max-w-[150px] truncate",
                isOnDashboardHome && displayBreadcrumbs.length === 0 
                  ? "text-foreground font-medium" 
                  : ""
              )}>
                {tenantName}
              </span>
            )}
          </Link>
        </li>
        {displayBreadcrumbs.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {crumb.isLast ? (
              <span className="text-foreground font-medium">{crumb.label}</span>
            ) : (
              <Link 
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
