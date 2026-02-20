"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Calculator,
  Package,
  CheckCircle,
  Copy,
  Check,
  User,
  Building2,
  Shield,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import {
  formatCurrency,
  toSafeNumber,
  safeMultiply,
  safeDivide,
  safeAdd,
  safeSubtract,
  safeRound,
} from "@/lib/utils";

// ============================================
// Types
// ============================================

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
  legalFeeType: string;
  legalFeeValue: string;
  stampingFeeType: string;
  stampingFeeValue: string;
  loanScheduleType: string;
  eligibleBorrowerTypes: string;
}

type BorrowerTypeFilter = "ALL" | "INDIVIDUAL" | "CORPORATE";
type ScheduleTypeFilter = "ALL" | "JADUAL_J" | "JADUAL_K";

interface LoanCalculation {
  loanAmount: number;
  term: number;
  interestRate: number;
  interestModel: string;
  legalFee: number;
  stampingFee: number;
  totalFees: number;
  netDisbursement: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPayable: number;
}

// ============================================
// Main Component
// ============================================

export default function CalculatorPage() {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [amount, setAmount] = useState<number | "">(0);
  const [term, setTerm] = useState<number | "">(12);
  const [calculation, setCalculation] = useState<LoanCalculation | null>(null);
  const [copied, setCopied] = useState(false);

  // Filters
  const [borrowerTypeFilter, setBorrowerTypeFilter] = useState<BorrowerTypeFilter>("ALL");
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<ScheduleTypeFilter>("ALL");

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await api.get<Product[]>("/api/products?activeOnly=true");
        if (res.success && res.data) {
          setProducts(Array.isArray(res.data) ? res.data : []);
        }
      } catch (error) {
        console.error("Failed to fetch products:", error);
        toast.error("Failed to load products");
      }
      setLoading(false);
    };

    fetchProducts();
  }, []);

  // Calculate loan when amount/term/product changes
  useEffect(() => {
    const numAmount = amount === "" ? 0 : amount;
    const numTerm = term === "" ? 0 : term;
    if (!selectedProduct || numAmount <= 0 || numTerm <= 0) {
      setCalculation(null);
      return;
    }

    const calculateLoan = () => {
      const loanAmount = numAmount;
      const interestRate = toSafeNumber(selectedProduct.interestRate);

      // Calculate fees
      const legalFeeValue = toSafeNumber(selectedProduct.legalFeeValue);
      const stampingFeeValue = toSafeNumber(selectedProduct.stampingFeeValue);

      const legalFee =
        selectedProduct.legalFeeType === "PERCENTAGE"
          ? safeMultiply(loanAmount, safeDivide(legalFeeValue, 100))
          : legalFeeValue;

      const stampingFee =
        selectedProduct.stampingFeeType === "PERCENTAGE"
          ? safeMultiply(loanAmount, safeDivide(stampingFeeValue, 100))
          : stampingFeeValue;

      const totalFees = safeAdd(legalFee, stampingFee);
      const netDisbursement = safeSubtract(loanAmount, totalFees);

      // Calculate monthly payment
      let monthlyPayment: number;
      let totalInterest: number;
      let totalPayable: number;

      if (selectedProduct.interestModel === "FLAT") {
        // Flat interest: Principal × Rate × Term / 12
        const annualRate = safeDivide(interestRate, 100);
        totalInterest = safeMultiply(
          safeMultiply(loanAmount, annualRate),
          safeDivide(numTerm, 12)
        );
        totalPayable = safeAdd(loanAmount, totalInterest);
        monthlyPayment = safeDivide(totalPayable, numTerm);
      } else {
        // Declining balance EMI
        const monthlyRate = safeDivide(interestRate, 12 * 100);
        if (monthlyRate === 0) {
          monthlyPayment = safeDivide(loanAmount, numTerm);
        } else {
          const factor = Math.pow(1 + monthlyRate, numTerm);
          monthlyPayment = safeMultiply(
            loanAmount,
            safeDivide(safeMultiply(monthlyRate, factor), factor - 1)
          );
        }
        totalPayable = safeMultiply(monthlyPayment, numTerm);
        totalInterest = safeSubtract(totalPayable, loanAmount);
      }

      setCalculation({
        loanAmount,
        term: numTerm,
        interestRate,
        interestModel: selectedProduct.interestModel,
        legalFee,
        stampingFee,
        totalFees,
        netDisbursement,
        monthlyPayment: safeRound(monthlyPayment, 2),
        totalInterest: safeRound(totalInterest, 2),
        totalPayable: safeRound(totalPayable, 2),
      });
    };

    calculateLoan();
  }, [selectedProduct, amount, term]);

  // Filter products based on selected filters
  const filteredProducts = products.filter((product) => {
    // Filter by borrower type
    if (borrowerTypeFilter !== "ALL") {
      const eligibility = product.eligibleBorrowerTypes || "BOTH";
      if (eligibility !== "BOTH" && eligibility !== borrowerTypeFilter) {
        return false;
      }
    }

    // Filter by schedule type
    if (scheduleTypeFilter !== "ALL") {
      if (product.loanScheduleType !== scheduleTypeFilter) {
        return false;
      }
    }

    return true;
  });

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setAmount(toSafeNumber(product.minAmount));
    setTerm(product.minTerm);
  };

  // Clear selected product if it's filtered out
  useEffect(() => {
    if (selectedProduct && !filteredProducts.find(p => p.id === selectedProduct.id)) {
      setSelectedProduct(null);
      setCalculation(null);
    }
  }, [borrowerTypeFilter, scheduleTypeFilter, filteredProducts, selectedProduct]);

  const handleCopyToWhatsApp = () => {
    if (!calculation || !selectedProduct) return;

    // Format for WhatsApp (using simple text formatting)
    const collateralRequired = selectedProduct.loanScheduleType === "JADUAL_K" ? "Yes" : "No";
    const message = `*Loan Quote - ${selectedProduct.name}*

Loan Amount: RM ${calculation.loanAmount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Loan Term: ${calculation.term} months
Interest Rate: ${calculation.interestRate}% p.a. (${calculation.interestModel === "FLAT" ? "Flat" : "Reducing Balance"})
Collateral Required: ${collateralRequired}
Monthly Repayment: RM ${calculation.monthlyPayment.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

_Quote generated by TrueKredit_`;

    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      toast.success("Quote copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-gradient">
          Loan Calculator
        </h1>
        <p className="text-muted-foreground">
          Calculate loan repayments and generate quotes for prospective customers
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Product Selection & Inputs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Select Loan Product
              </CardTitle>
              <CardDescription>
                Choose a product to calculate loan repayments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-6 p-4 rounded-lg border border-border bg-secondary">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters:</span>
                </div>

                {/* Borrower Type Filter */}
                <div className="flex items-center gap-2 pl-4 border-l border-border">
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
                <div className="flex items-center gap-2 pl-4 border-l border-border">
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

              {/* Product Grid */}
              {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No active products available
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Filter className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No products match the selected filters
                  </p>
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
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredProducts.map((product) => {
                    const eligibility = product.eligibleBorrowerTypes || "BOTH";
                    return (
                      <div
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedProduct?.id === product.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {product.interestModel === "FLAT" ? "Flat Rate" : "Reducing Balance"}
                              </Badge>
                              <Badge
                                variant={product.loanScheduleType === "JADUAL_K" ? "default" : "secondary"}
                                className="text-xs flex items-center gap-0.5"
                              >
                                {product.loanScheduleType === "JADUAL_K" ? (
                                  <ShieldCheck className="h-3 w-3" />
                                ) : (
                                  <Shield className="h-3 w-3" />
                                )}
                                {product.loanScheduleType === "JADUAL_K" ? "Jadual K" : "Jadual J"}
                              </Badge>
                            </div>
                          </div>
                          {selectedProduct?.id === product.id && (
                            <CheckCircle className="h-5 w-5 text-foreground shrink-0" />
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-sm mt-3">
                          <div>
                            <span className="text-muted-foreground">Rate:</span>{" "}
                            <span className="font-medium">{product.interestRate}% p.a.</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Term:</span>{" "}
                            <span className="font-medium">
                              {product.minTerm}-{product.maxTerm}mo
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          {eligibility === "INDIVIDUAL" ? (
                            <>
                              <User className="h-3 w-3" />
                              Individual only
                            </>
                          ) : eligibility === "CORPORATE" ? (
                            <>
                              <Building2 className="h-3 w-3" />
                              Corporate only
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3" />
                              <Building2 className="h-3 w-3" />
                              All borrowers
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Loan Parameters */}
          {selectedProduct && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Loan Parameters
                </CardTitle>
                <CardDescription>
                  Adjust the loan amount and term
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(() => {
                    const minAmount = toSafeNumber(selectedProduct.minAmount);
                    const maxAmount = toSafeNumber(selectedProduct.maxAmount);
                    const numAmount = amount === "" ? 0 : amount;
                    const isAmountInvalid = numAmount > 0 && (numAmount < minAmount || numAmount > maxAmount);
                    return (
                      <div>
                        <label className="text-sm font-medium">
                          Loan Amount (RM)
                        </label>
                        <p className="text-xs text-muted-foreground mb-1">
                          {formatCurrency(minAmount)} - {formatCurrency(maxAmount)}
                        </p>
                        <NumericInput
                          value={amount}
                          onChange={setAmount}
                          min={minAmount}
                          max={maxAmount}
                          className={isAmountInvalid ? "border-red-500 focus:ring-red-500" : ""}
                        />
                        {isAmountInvalid && (
                          <p className="text-xs text-red-500 mt-1">
                            {numAmount < minAmount
                              ? `Minimum amount is ${formatCurrency(minAmount)}`
                              : `Maximum amount is ${formatCurrency(maxAmount)}`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const minTerm = selectedProduct.minTerm;
                    const maxTerm = selectedProduct.maxTerm;
                    const numTerm = term === "" ? 0 : term;
                    const isTermInvalid = numTerm > 0 && (numTerm < minTerm || numTerm > maxTerm);
                    return (
                      <div>
                        <label className="text-sm font-medium">
                          Term (months)
                        </label>
                        <p className="text-xs text-muted-foreground mb-1">
                          {minTerm} - {maxTerm} months
                        </p>
                        <NumericInput
                          value={term}
                          onChange={setTerm}
                          min={minTerm}
                          max={maxTerm}
                          className={isTermInvalid ? "border-red-500 focus:ring-red-500" : ""}
                        />
                        {isTermInvalid && (
                          <p className="text-xs text-red-500 mt-1">
                            {numTerm < minTerm
                              ? `Minimum term is ${minTerm} months`
                              : `Maximum term is ${maxTerm} months`}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Calculation Result */}
        <div className="lg:col-span-1">
          {calculation && selectedProduct ? (
            <Card className="sticky top-24 text-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-foreground/10">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Loan Quote
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToWhatsApp}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy for WhatsApp
                      </>
                    )}
                  </Button>
                </div>
                <CardDescription>
                  {selectedProduct.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Loan Amount</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(calculation.loanAmount)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Loan Term</TableCell>
                      <TableCell className="text-right">
                        {calculation.term} months
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Interest Rate</TableCell>
                      <TableCell className="text-right">
                        {calculation.interestRate}% p.a.
                        <Badge variant="outline" className="ml-2 text-xs">
                          {calculation.interestModel === "FLAT" ? "Flat" : "Reducing"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Collateral Required</TableCell>
                      <TableCell className="text-right">
                        {selectedProduct.loanScheduleType === "JADUAL_K" ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="text-muted-foreground">Legal Fee</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(calculation.legalFee)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Stamping Fee</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(calculation.stampingFee)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Total Fees</TableCell>
                      <TableCell className="text-right text-amber-600 dark:text-amber-400">
                        {formatCurrency(calculation.totalFees)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Net Disbursement</TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(calculation.netDisbursement)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-medium">Total Interest</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(calculation.totalInterest)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Total Payable</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(calculation.totalPayable)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {/* Monthly Payment Highlight */}
                <div className="mt-4 p-4 rounded-lg bg-foreground/10 dark:bg-primary/20 border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground">Monthly Repayment</span>
                    <span className="font-bold text-base text-foreground">
                      {formatCurrency(calculation.monthlyPayment)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-4 text-center">
                  This is an estimate only. Actual terms may vary.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-3 rounded-full bg-muted mb-4">
                    <Calculator className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    Select a product and enter loan details to see the calculation
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
