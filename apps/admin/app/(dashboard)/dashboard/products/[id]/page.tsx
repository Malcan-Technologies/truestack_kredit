"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Percent,
  Settings,
  FileText,
  Pencil,
  Power,
  PowerOff,
  Calendar,
  Clock,
  Plus,
  Trash2,
  User,
  Building2,
  Users,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime, formatCurrency, toSafeNumber } from "@/lib/utils";
import { useCurrentRole } from "@/components/tenant-context";
import { canManageProducts } from "@/lib/permissions";

// ============================================
// Types
// ============================================

interface RequiredDocument {
  key: string;
  label: string;
  required: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  interestModel: string;
  interestRate: string;
  latePaymentRate: string;
  arrearsPeriod: number;
  defaultPeriod: number;
  minAmount: string;
  maxAmount: string;
  minTerm: number;
  maxTerm: number;
  isActive: boolean;
  legalFeeType: string;
  legalFeeValue: string;
  stampingFeeType: string;
  stampingFeeValue: string;
  requiredDocuments: RequiredDocument[];
  eligibleBorrowerTypes: string;
  loanScheduleType: string;
  earlySettlementEnabled: boolean;
  earlySettlementLockInMonths: number;
  earlySettlementDiscountType: string;
  earlySettlementDiscountValue: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    loans: number;
    applications: number;
  };
}

interface TimelineEvent {
  id: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

// ============================================
// Constants
// ============================================

const interestModelLabels: Record<string, string> = {
  FLAT: "Flat Rate",
  DECLINING_BALANCE: "Declining Balance",
  EFFECTIVE_RATE: "Effective Rate",
};

// ============================================
// Timeline Component
// ============================================

// Helper to format audit log values for display
function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(empty)";
  }
  
  // Handle requiredDocuments array - show document labels
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "(none)";
    }
    // Check if it's an array of document objects with 'label' property
    if (value[0] && typeof value[0] === 'object' && 'label' in value[0]) {
      return value.map((doc: { label: string; required?: boolean }) => 
        doc.required ? `${doc.label} *` : doc.label
      ).join(", ");
    }
    // Generic array - show count or items
    if (value.length <= 3) {
      return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(", ");
    }
    return `${value.length} items`;
  }
  
  // Handle objects
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? "Yes" : "No";
  }
  
  return String(value);
}

// Helper to format field names for display
function formatFieldName(field: string): string {
  const fieldLabels: Record<string, string> = {
    requiredDocuments: "Required Documents",
    interestRate: "Interest Rate",
    latePaymentRate: "Late Payment Rate",
    interestModel: "Interest Model",
    eligibleBorrowerTypes: "Borrower Eligibility",
    loanScheduleType: "Loan Schedule",
    minAmount: "Min Amount",
    maxAmount: "Max Amount",
    minTerm: "Min Term",
    maxTerm: "Max Term",
    arrearsPeriod: "Arrears Period",
    defaultPeriod: "Default Period",
    legalFeeType: "Legal Fee Type",
    legalFeeValue: "Legal Fee",
    stampingFeeType: "Stamping Fee Type",
    stampingFeeValue: "Stamping Fee",
    isActive: "Status",
    earlySettlementEnabled: "Early Settlement",
    earlySettlementLockInMonths: "Lock-in Period",
    earlySettlementDiscountType: "Discount Type",
    earlySettlementDiscountValue: "Discount Value",
  };
  return fieldLabels[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const getActionInfo = (action: string) => {
    switch (action) {
      case "CREATE":
        return { icon: Plus, label: "Created", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
      case "UPDATE":
        return { icon: Pencil, label: "Updated", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" };
      case "DELETE":
        return { icon: Trash2, label: "Deleted", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" };
      default:
        return { icon: Clock, label: action, color: "text-muted-foreground", bg: "bg-muted" };
    }
  };

  const actionInfo = getActionInfo(event.action);
  const Icon = actionInfo.icon;

  const getChanges = () => {
    if (event.action !== "UPDATE" || !event.previousData || !event.newData) {
      return null;
    }
    const changes: { field: string; fieldLabel: string; from: string; to: string }[] = [];
    const prev = event.previousData;
    const next = event.newData;
    for (const key of Object.keys(next)) {
      const prevVal = prev[key];
      const nextVal = next[key];
      if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
        changes.push({ 
          field: key, 
          fieldLabel: formatFieldName(key),
          from: formatAuditValue(prevVal), 
          to: formatAuditValue(nextVal) 
        });
      }
    }
    return changes;
  };

  const changes = getChanges();

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${actionInfo.bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${actionInfo.color}`} />
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-medium ${actionInfo.color}`}>{actionInfo.label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        {event.user && (
          <p className="text-sm text-muted-foreground mb-2">
            by {event.user.name || event.user.email}
          </p>
        )}
        {changes && changes.length > 0 && (
          <div className="bg-slate-50 dark:bg-card border border-border rounded-lg p-3 space-y-3">
            {changes.map((change, idx) => (
              <div key={idx} className="text-xs space-y-1">
                <span className="font-medium text-foreground">{change.fieldLabel}</span>
                <div className="flex flex-col gap-1 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0 w-10">From:</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 line-through break-words">
                      {change.from}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0 w-10">To:</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 font-medium break-words">
                      {change.to}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {event.action === "CREATE" && event.newData && (
          <div className="bg-slate-50 dark:bg-card border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              Product created: <span className="font-medium text-foreground">{event.newData.name as string}</span>
            </p>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          {formatDate(event.createdAt)} {event.ipAddress && `• IP: ${event.ipAddress}`}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const currentRole = useCurrentRole();

  const [product, setProduct] = useState<Product | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchProduct = useCallback(async () => {
    try {
      const res = await api.get<Product>(`/api/products/${productId}`);
      if (res.success && res.data) {
        setProduct(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch product:", error);
    }
  }, [productId]);

  const fetchTimeline = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setLoadingMoreTimeline(true);
      }
      const res = await fetch(`/api/proxy/products/${productId}/timeline?limit=10${cursor ? `&cursor=${cursor}` : ''}`, {
        credentials: "include",
      });
      const json = await res.json() as { 
        success: boolean; 
        data: TimelineEvent[]; 
        pagination: { hasMore: boolean; nextCursor: string | null } 
      };
      
      if (json.success && json.data) {
        if (append) {
          setTimeline((prev) => [...prev, ...json.data]);
        } else {
          setTimeline(json.data);
        }
        setHasMoreTimeline(json.pagination?.hasMore ?? false);
        setTimelineCursor(json.pagination?.nextCursor ?? null);
      }
    } catch (error) {
      console.error("Failed to fetch timeline:", error);
    } finally {
      setLoadingMoreTimeline(false);
    }
  }, [productId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchProduct(), fetchTimeline()]);
      setLoading(false);
    };
    loadData();
  }, [fetchProduct, fetchTimeline]);

  const handleToggleActive = async () => {
    if (!product) return;
    setToggling(true);
    try {
      const res = await api.patch<Product>(`/api/products/${product.id}`, {
        isActive: !product.isActive,
      });
      if (res.success) {
        toast.success(`Product ${product.isActive ? "deactivated" : "activated"}`);
        await fetchProduct();
        fetchTimeline();
      } else {
        toast.error(res.error || "Failed to update product");
      }
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-8 text-muted">Product not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-heading font-bold text-gradient">
                {product.name}
              </h1>
              <Badge variant={product.isActive ? "success" : "secondary"}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {product.description}
              <span className="mx-2">•</span>
              Created {formatDate(product.createdAt)}
            </p>
          </div>
        </div>
        {canManageProducts(currentRole) && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {product.isActive ? (
                <>
                  <PowerOff className="h-4 w-4 mr-2" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Activate
                </>
              )}
            </Button>
            <Link href={`/dashboard/products/${product.id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Product
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Usage Summary - Full Width */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Active Loans</span>
                    <Badge variant="outline">{product._count.loans}</Badge>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Applications</span>
                    <Badge variant="outline">{product._count.applications}</Badge>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Last Updated</span>
                    <span className="text-sm font-medium">{formatDate(product.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-accent" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Model</p>
                    <p className="font-medium">{interestModelLabels[product.interestModel]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Borrower Eligibility</p>
                    <div className="flex items-center gap-1 font-medium">
                      {product.eligibleBorrowerTypes === "INDIVIDUAL" && <User className="h-4 w-4" />}
                      {product.eligibleBorrowerTypes === "CORPORATE" && <Building2 className="h-4 w-4" />}
                      {product.eligibleBorrowerTypes === "BOTH" && <Users className="h-4 w-4" />}
                      {product.eligibleBorrowerTypes === "INDIVIDUAL" && "Individual Only"}
                      {product.eligibleBorrowerTypes === "CORPORATE" && "Corporate Only"}
                      {product.eligibleBorrowerTypes === "BOTH" && "All Borrowers"}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Loan Schedule Type</p>
                    <div className="flex items-center gap-1 font-medium">
                      {product.loanScheduleType === "JADUAL_K" ? (
                        <ShieldCheck className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                      {product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rates & Fees */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-accent" />
                  Rates & Fees
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{product.interestRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Late Payment Rate</p>
                    <p className="font-medium">{product.latePaymentRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Legal Fee</p>
                    <p className="font-medium">
                      {product.legalFeeType === "PERCENTAGE"
                        ? `${product.legalFeeValue}%`
                        : formatCurrency(toSafeNumber(product.legalFeeValue))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stamping Fee</p>
                    <p className="font-medium">
                      {product.stampingFeeType === "PERCENTAGE"
                        ? `${product.stampingFeeValue}%`
                        : formatCurrency(toSafeNumber(product.stampingFeeValue))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Early Settlement */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-accent" />
                  Early Settlement
                </CardTitle>
              </CardHeader>
              <CardContent>
                {product.earlySettlementEnabled ? (
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge variant="success">Enabled</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lock-in Period</p>
                      <p className="font-medium">
                        {product.earlySettlementLockInMonths === 0
                          ? "No lock-in"
                          : `${product.earlySettlementLockInMonths} months`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Discount</p>
                      <p className="font-medium">
                        {product.earlySettlementDiscountType === "PERCENTAGE"
                          ? `${product.earlySettlementDiscountValue}% of remaining interest`
                          : `${formatCurrency(toSafeNumber(product.earlySettlementDiscountValue))} flat`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Early settlement is not enabled for this product</p>
                )}
              </CardContent>
            </Card>

            {/* Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-accent" />
                  Limits & Collection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount Range</p>
                    <p className="font-medium">
                      {formatCurrency(toSafeNumber(product.minAmount))} - {formatCurrency(toSafeNumber(product.maxAmount))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Term Range</p>
                    <p className="font-medium">{product.minTerm} - {product.maxTerm} months</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Arrears Period</p>
                    <p className="font-medium">{product.arrearsPeriod} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Default Period</p>
                    <p className="font-medium">{product.defaultPeriod} days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Required Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-accent" />
                  Required Documents
                </CardTitle>
                <CardDescription>
                  Documents required for loan applications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {product.requiredDocuments && product.requiredDocuments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {product.requiredDocuments.map((doc) => (
                      <Badge
                        key={doc.key}
                        variant={doc.required ? "default" : "outline"}
                      >
                        {doc.label}
                        {doc.required && " *"}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents configured</p>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-accent" />
                Activity Timeline
              </CardTitle>
              <CardDescription>Changes and events for this product</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity recorded yet
                </p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                  {hasMoreTimeline && (
                    <div className="pt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchTimeline(timelineCursor || undefined, true)}
                        disabled={loadingMoreTimeline}
                      >
                        {loadingMoreTimeline ? "Loading..." : "Load More"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
