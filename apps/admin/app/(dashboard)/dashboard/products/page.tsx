"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Package,
  Edit2,
  Eye,
  Power,
  PowerOff,
  User,
  Building2,
  Users,
  Shield,
  ShieldCheck,
  Filter,
  TrendingUp,
  Clock,
  Banknote,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TableActionButton } from "@/components/ui/table-action-button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatCurrency, toSafeNumber } from "@/lib/utils";
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
  _count: {
    loans: number;
    applications: number;
  };
}

type BorrowerTypeFilter = "ALL" | "INDIVIDUAL" | "CORPORATE";
type ScheduleTypeFilter = "ALL" | "JADUAL_J" | "JADUAL_K";

// ============================================
// Main Component
// ============================================

const HIDE_INACTIVE_STORAGE_KEY = "products_hide_inactive";

const interestModelLabels: Record<string, string> = {
  FLAT: "Flat Rate",
  DECLINING_BALANCE: "Reducing Balance",
  EFFECTIVE_RATE: "Effective Rate",
};

export default function ProductsPage() {
  const currentRole = useCurrentRole();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideInactive, setHideInactive] = useState(true);

  // Filters
  const [borrowerTypeFilter, setBorrowerTypeFilter] = useState<BorrowerTypeFilter>("ALL");
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<ScheduleTypeFilter>("ALL");

  // Load preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(HIDE_INACTIVE_STORAGE_KEY);
    if (stored !== null) {
      setHideInactive(stored === "true");
    }
  }, []);

  // Persist preference to localStorage when changed
  const handleHideInactiveChange = (value: boolean) => {
    setHideInactive(value);
    localStorage.setItem(HIDE_INACTIVE_STORAGE_KEY, String(value));
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get<Product[]>("/api/products");
      if (res.success && res.data) {
        setProducts(Array.isArray(res.data) ? res.data : []);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
      setProducts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleToggleActive = async (product: Product) => {
    const res = await api.patch<Product>(`/api/products/${product.id}`, {
      isActive: !product.isActive,
    });
    if (res.success) {
      toast.success(`Product ${product.isActive ? "deactivated" : "activated"}`);
      fetchProducts();
    } else {
      toast.error(res.error || "Failed to update product");
    }
  };

  // Filter products
  const filteredProducts = products
    .filter((product) => !hideInactive || product.isActive)
    .filter((product) => {
      if (borrowerTypeFilter !== "ALL") {
        const eligibility = product.eligibleBorrowerTypes || "BOTH";
        if (eligibility !== "BOTH" && eligibility !== borrowerTypeFilter) {
          return false;
        }
      }
      if (scheduleTypeFilter !== "ALL") {
        if (product.loanScheduleType !== scheduleTypeFilter) {
          return false;
        }
      }
      return true;
    });

  const hasActiveFilters = borrowerTypeFilter !== "ALL" || scheduleTypeFilter !== "ALL";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loan Products</h1>
          <p className="text-muted-foreground">Configure your loan products</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="hide-inactive"
              checked={hideInactive}
              onCheckedChange={handleHideInactiveChange}
            />
            <Label htmlFor="hide-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Hide inactive
            </Label>
          </div>
          {canManageProducts(currentRole) && (
            <Link href="/dashboard/products/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        {/* Borrower Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Borrower:</span>
          <div className="flex gap-1">
            <Button
              variant={borrowerTypeFilter === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setBorrowerTypeFilter("ALL")}
              className="h-7 px-2 text-xs"
            >
              All
            </Button>
            <Button
              variant={borrowerTypeFilter === "INDIVIDUAL" ? "default" : "outline"}
              size="sm"
              onClick={() => setBorrowerTypeFilter("INDIVIDUAL")}
              className="h-7 px-2 text-xs gap-1"
            >
              <User className="h-3 w-3" />
              Individual
            </Button>
            <Button
              variant={borrowerTypeFilter === "CORPORATE" ? "default" : "outline"}
              size="sm"
              onClick={() => setBorrowerTypeFilter("CORPORATE")}
              className="h-7 px-2 text-xs gap-1"
            >
              <Building2 className="h-3 w-3" />
              Corporate
            </Button>
          </div>
        </div>

        {/* Schedule Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Schedule:</span>
          <div className="flex gap-1">
            <Button
              variant={scheduleTypeFilter === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleTypeFilter("ALL")}
              className="h-7 px-2 text-xs"
            >
              All
            </Button>
            <Button
              variant={scheduleTypeFilter === "JADUAL_J" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleTypeFilter("JADUAL_J")}
              className="h-7 px-2 text-xs gap-1"
            >
              <Shield className="h-3 w-3" />
              Jadual J
            </Button>
            <Button
              variant={scheduleTypeFilter === "JADUAL_K" ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleTypeFilter("JADUAL_K")}
              className="h-7 px-2 text-xs gap-1"
            >
              <ShieldCheck className="h-3 w-3" />
              Jadual K
            </Button>
          </div>
        </div>
      </div>

      {/* Products grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products configured</p>
            <Link href="/dashboard/products/new">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create your first product
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products match the selected filters</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setBorrowerTypeFilter("ALL");
                setScheduleTypeFilter("ALL");
              }}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className={`group relative overflow-hidden transition-all hover:shadow-md flex flex-col ${
                !product.isActive ? "opacity-60" : ""
              }`}
            >
              {/* Card Header - Name, Status, Type badges */}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/products/${product.id}`}>
                      <CardTitle className="text-lg hover:text-primary hover:underline cursor-pointer truncate">
                        {product.name}
                      </CardTitle>
                    </Link>
                    {product.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={product.isActive ? "success" : "secondary"} className="shrink-0">
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {/* Type badges */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    {interestModelLabels[product.interestModel]}
                  </Badge>
                  <Badge
                    variant={product.loanScheduleType === "JADUAL_K" ? "default" : "outline"}
                    className="text-xs flex items-center gap-1"
                  >
                    {product.loanScheduleType === "JADUAL_K" ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : (
                      <Shield className="h-3 w-3" />
                    )}
                    {product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                  </Badge>
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    {product.eligibleBorrowerTypes === "INDIVIDUAL" && (
                      <>
                        <User className="h-3 w-3" />
                        Individual
                      </>
                    )}
                    {product.eligibleBorrowerTypes === "CORPORATE" && (
                      <>
                        <Building2 className="h-3 w-3" />
                        Corporate
                      </>
                    )}
                    {product.eligibleBorrowerTypes === "BOTH" && (
                      <>
                        <Users className="h-3 w-3" />
                        All Borrowers
                      </>
                    )}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-0 space-y-4 flex-1">
                {/* Key Metrics - Highlighted */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col items-center text-center p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                    <TrendingUp className="h-4 w-4 text-primary mb-1.5" />
                    <span className="text-lg font-heading font-bold">{product.interestRate}%</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">p.a.</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                    <Clock className="h-4 w-4 text-primary mb-1.5" />
                    <span className="text-lg font-heading font-bold">
                      {product.minTerm}-{product.maxTerm}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">months</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                    <Banknote className="h-4 w-4 text-primary mb-1.5" />
                    <span className="text-lg font-heading font-bold">
                      {Number(product.maxAmount) >= 1000
                        ? `${Math.round(Number(product.maxAmount) / 1000)}K`
                        : formatCurrency(Number(product.maxAmount))}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight">max</span>
                  </div>
                </div>

                {/* Secondary Details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount Range</span>
                  </div>
                  <span className="font-medium text-right">
                    {formatCurrency(Number(product.minAmount))} -{" "}
                    {formatCurrency(Number(product.maxAmount))}
                  </span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Legal Fee</span>
                  </div>
                  <span className="font-medium text-right">
                    {product.legalFeeType === "PERCENTAGE"
                      ? `${product.legalFeeValue}%`
                      : formatCurrency(toSafeNumber(product.legalFeeValue))}
                  </span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stamping Fee</span>
                  </div>
                  <span className="font-medium text-right">
                    {product.stampingFeeType === "PERCENTAGE"
                      ? `${product.stampingFeeValue}%`
                      : formatCurrency(toSafeNumber(product.stampingFeeValue))}
                  </span>
                </div>

                {/* Documents count */}
                {product.requiredDocuments?.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {product.requiredDocuments.length} required document
                    {product.requiredDocuments.length !== 1 ? "s" : ""}
                  </div>
                )}

              </CardContent>
              <CardFooter className="flex items-center justify-between gap-4 border-t border-border pt-6 mt-auto">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{product._count.loans} loans</span>
                  {product._count.applications > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span>{product._count.applications} applications</span>
                    </>
                  )}
                </div>
                <div className="flex gap-1">
                  <Link href={`/dashboard/products/${product.id}`}>
                    <TableActionButton icon={Eye} label="View" onClick={() => {}} />
                  </Link>
                  {canManageProducts(currentRole) && (
                    <>
                      <Link href={`/dashboard/products/${product.id}/edit`}>
                        <TableActionButton icon={Edit2} label="Edit" onClick={() => {}} />
                      </Link>
                      <TableActionButton
                        icon={product.isActive ? PowerOff : Power}
                        label={product.isActive ? "Deactivate" : "Activate"}
                        variant={product.isActive ? "destructive" : "success"}
                        onClick={() => handleToggleActive(product)}
                      />
                    </>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
