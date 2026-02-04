"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Eye, Building2, User, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableActionButton } from "@/components/ui/table-action-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LoanProgress {
  paidCount: number;
  totalRepayments: number;
  progressPercent: number;
  readyToComplete: boolean;
}

interface Loan {
  id: string;
  principalAmount: string;
  interestRate: string;
  term: number;
  status: string;
  disbursementDate: string | null;
  createdAt: string;
  borrower: {
    id: string;
    name: string;
    icNumber: string;
    borrowerType: string;
    companyName: string | null;
  };
  product: {
    id: string;
    name: string;
  };
  progress?: LoanProgress;
}

// Mini donut chart component
function ProgressDonut({ 
  percent, 
  size = 32, 
  strokeWidth = 4,
  readyToComplete = false,
}: { 
  percent: number; 
  size?: number; 
  strokeWidth?: number;
  readyToComplete?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = size / 2;
  
  // Determine color based on progress
  let strokeColor = "stroke-primary";
  if (percent === 100) {
    strokeColor = "stroke-emerald-500";
  } else if (percent >= 75) {
    strokeColor = "stroke-blue-500";
  } else if (percent >= 50) {
    strokeColor = "stroke-amber-500";
  } else if (percent > 0) {
    strokeColor = "stroke-orange-500";
  }
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={strokeColor}
        />
      </svg>
      {readyToComplete && (
        <CheckCircle className="absolute h-3 w-3 text-emerald-500" />
      )}
    </div>
  );
}

const statusColors: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  PENDING_DISBURSEMENT: "warning",
  ACTIVE: "info",
  IN_ARREARS: "destructive",
  COMPLETED: "success",
  DEFAULTED: "destructive",
  WRITTEN_OFF: "destructive",
};

export default function LoansPage() {
  const [allLoans, setAllLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  const fetchLoans = async () => {
    setLoading(true);
    try {
      // For READY_TO_COMPLETE, we need to fetch all active/in-arrears loans and filter client-side
      const statusParam = filter === "READY_TO_COMPLETE" ? "" : filter;
      const res = await api.get<Loan[]>(
        `/api/loans${statusParam ? `?status=${statusParam}` : ""}`
      );
      if (res.success && res.data) {
        setAllLoans(Array.isArray(res.data) ? res.data : []);
      } else {
        setAllLoans([]);
      }
    } catch (error) {
      console.error("Failed to fetch loans:", error);
      setAllLoans([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLoans();
  }, [filter]);

  // Apply client-side filter for READY_TO_COMPLETE
  const loans = filter === "READY_TO_COMPLETE"
    ? allLoans.filter(loan => loan.progress?.readyToComplete)
    : allLoans;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gradient">Loans</h1>
          <p className="text-muted">View and manage active loans</p>
        </div>
        <Link href="/dashboard/applications">
          <Button>View Applications</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("")}
        >
          All
        </Button>
        <Button
          variant={filter === "PENDING_DISBURSEMENT" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("PENDING_DISBURSEMENT")}
        >
          Pending Disbursement
        </Button>
        <Button
          variant={filter === "ACTIVE" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("ACTIVE")}
        >
          Active
        </Button>
        <Button
          variant={filter === "COMPLETED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("COMPLETED")}
          className={filter === "COMPLETED" ? "" : "text-emerald-600 border-emerald-500/50 hover:bg-emerald-500/10"}
        >
          Completed
        </Button>
        <span className="border-l border-border mx-1" />
        <Button
          variant={filter === "READY_TO_COMPLETE" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("READY_TO_COMPLETE")}
        >
          Ready to Complete
        </Button>
        <span className="border-l border-border mx-1" />
        <Button
          variant={filter === "IN_ARREARS" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("IN_ARREARS")}
          className={filter === "IN_ARREARS" ? "" : "text-destructive border-destructive/50 hover:bg-destructive/10"}
        >
          In Arrears
        </Button>
        <Button
          variant={filter === "DEFAULTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("DEFAULTED")}
          className={filter === "DEFAULTED" ? "" : "text-destructive border-destructive/50 hover:bg-destructive/10"}
        >
          Defaulted
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted">Loading...</div>
            </div>
          ) : loans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FileText className="h-12 w-12 text-muted mb-4" />
              <p className="text-muted">No loans found</p>
              <Link href="/dashboard/applications">
                <Button className="mt-4">Create Application</Button>
              </Link>
            </div>
          ) : (
            <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Disbursed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => {
                  const isCorporate = loan.borrower.borrowerType === "CORPORATE";
                  const displayName = isCorporate && loan.borrower.companyName
                    ? loan.borrower.companyName
                    : loan.borrower.name;
                  const progress = loan.progress;

                  return (
                  <TableRow 
                    key={loan.id}
                    className={progress?.readyToComplete ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
                  >
                    <TableCell>
                      <Link href={`/dashboard/loans/${loan.id}`} className="block">
                        <div>
                          <p className="font-medium hover:text-primary hover:underline">{displayName}</p>
                          {isCorporate && loan.borrower.companyName && (
                            <p className="text-xs text-muted-foreground">Rep: {loan.borrower.name}</p>
                          )}
                          <p className="text-xs text-muted">{loan.borrower.icNumber}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {isCorporate ? (
                        <Badge variant="secondary" className="text-xs">
                          <Building2 className="h-3 w-3 mr-1" />
                          Corporate
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          Individual
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{loan.product.name}</TableCell>
                    <TableCell>{formatCurrency(Number(loan.principalAmount))}</TableCell>
                    <TableCell>{loan.interestRate}%</TableCell>
                    <TableCell>{loan.term} months</TableCell>
                    <TableCell>
                      {loan.status === "PENDING_DISBURSEMENT" ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : progress ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                              <ProgressDonut 
                                percent={progress.progressPercent} 
                                readyToComplete={progress.readyToComplete}
                              />
                              <span className="text-xs text-muted-foreground">
                                {progress.paidCount}/{progress.totalRepayments}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{progress.paidCount} of {progress.totalRepayments} payments complete ({progress.progressPercent}%)</p>
                            {progress.readyToComplete && (
                              <p className="text-emerald-500 font-medium">Ready to complete</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusColors[loan.status] || "default"}>
                          {loan.status.replace(/_/g, " ")}
                        </Badge>
                        {progress?.readyToComplete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="success" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Ready
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>All payments received. Ready to complete and discharge.</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {loan.disbursementDate ? formatDate(loan.disbursementDate) : "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/loans/${loan.id}`}>
                        <TableActionButton icon={Eye} label="View" />
                      </Link>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
