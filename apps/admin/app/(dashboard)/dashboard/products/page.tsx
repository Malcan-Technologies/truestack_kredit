"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Package, Edit2, Eye, Power, PowerOff, User, Building2, Users, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TableActionButton } from "@/components/ui/table-action-button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { formatCurrency, toSafeNumber } from "@/lib/utils";

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

// ============================================
// Main Component
// ============================================

const HIDE_INACTIVE_STORAGE_KEY = "products_hide_inactive";

const interestModelLabels: Record<string, string> = {
  FLAT: "Flat Rate",
  DECLINING_BALANCE: "Declining Balance",
  EFFECTIVE_RATE: "Effective Rate",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideInactive, setHideInactive] = useState(true);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loan Products</h1>
          <p className="text-muted">Configure your loan products</p>
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
          <Link href="/dashboard/products/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Products grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted">Loading...</div>
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Package className="h-12 w-12 text-muted mb-4" />
            <p className="text-muted">No products configured</p>
            <Link href="/dashboard/products/new">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Create your first product
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products
            .filter((product) => !hideInactive || product.isActive)
            .map((product) => (
            <Card key={product.id} className={!product.isActive ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Link href={`/dashboard/products/${product.id}`}>
                    <CardTitle className="text-lg hover:text-primary hover:underline cursor-pointer">
                      {product.name}
                    </CardTitle>
                  </Link>
                  <Badge variant={product.isActive ? "success" : "secondary"}>
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {product.description && (
                  <p className="text-sm text-muted">{product.description}</p>
                )}
                {/* Eligibility and Loan Type Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    {product.eligibleBorrowerTypes === "INDIVIDUAL" && <User className="h-3 w-3" />}
                    {product.eligibleBorrowerTypes === "CORPORATE" && <Building2 className="h-3 w-3" />}
                    {product.eligibleBorrowerTypes === "BOTH" && <Users className="h-3 w-3" />}
                    {product.eligibleBorrowerTypes === "INDIVIDUAL" && "Individual"}
                    {product.eligibleBorrowerTypes === "CORPORATE" && "Corporate"}
                    {product.eligibleBorrowerTypes === "BOTH" && "All Borrowers"}
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
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted">Interest Model</p>
                    <p className="font-medium">{interestModelLabels[product.interestModel]}</p>
                  </div>
                  <div>
                    <p className="text-muted">Interest Rate</p>
                    <p className="font-medium">{product.interestRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-muted">Legal Fee</p>
                    <p className="font-medium">
                      {product.legalFeeType === "PERCENTAGE"
                        ? `${product.legalFeeValue}%`
                        : formatCurrency(toSafeNumber(product.legalFeeValue))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Stamping Fee</p>
                    <p className="font-medium">
                      {product.stampingFeeType === "PERCENTAGE"
                        ? `${product.stampingFeeValue}%`
                        : formatCurrency(toSafeNumber(product.stampingFeeValue))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Amount Range</p>
                    <p className="font-medium">
                      {formatCurrency(Number(product.minAmount))} - {formatCurrency(Number(product.maxAmount))}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Term Range</p>
                    <p className="font-medium">{product.minTerm} - {product.maxTerm} months</p>
                  </div>
                </div>
                {product.requiredDocuments?.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted mb-1">Required Documents</p>
                    <div className="flex flex-wrap gap-1">
                      {product.requiredDocuments.slice(0, 3).map((doc) => (
                        <Badge key={doc.key} variant="outline" className="text-xs">
                          {doc.label}
                        </Badge>
                      ))}
                      {product.requiredDocuments.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{product.requiredDocuments.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-sm text-muted">
                    {product._count.loans} loans
                  </span>
                  <div className="flex gap-1">
                    <Link href={`/dashboard/products/${product.id}`}>
                      <TableActionButton
                        icon={Eye}
                        label="View"
                        onClick={() => {}}
                      />
                    </Link>
                    <Link href={`/dashboard/products/${product.id}/edit`}>
                      <TableActionButton
                        icon={Edit2}
                        label="Edit"
                        onClick={() => {}}
                      />
                    </Link>
                    <TableActionButton
                      icon={product.isActive ? PowerOff : Power}
                      label={product.isActive ? "Deactivate" : "Activate"}
                      variant={product.isActive ? "destructive" : "success"}
                      onClick={() => handleToggleActive(product)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
