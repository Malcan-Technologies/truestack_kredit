"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, User, UserCheck, UserMinus, UserPlus, UserX, ChevronLeft, ChevronRight, Building2, ImageIcon, Crown, ShieldCheck, Ban, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { RoleGate } from "@/components/role-gate";

interface AuditLogUser {
  id: string;
  email: string;
  name: string | null;
}

interface AuditLogDetails {
  email?: string;
  name?: string;
  role?: string;
  previousRole?: string;
  newRole?: string;
  isExistingUser?: boolean;
  // Tenant update details
  previousData?: {
    name?: string;
    licenseNumber?: string;
    registrationNumber?: string;
    email?: string;
    contactNumber?: string;
    businessAddress?: string;
  };
  newData?: {
    name?: string;
    licenseNumber?: string;
    registrationNumber?: string;
    email?: string;
    contactNumber?: string;
    businessAddress?: string;
  };
  // Logo details
  previousLogoUrl?: string;
  newLogoUrl?: string;
  deletedLogoUrl?: string;
  dimensions?: { width: number; height: number };
  // Ownership transfer details
  previousOwner?: { id: string; email: string; name?: string };
  newOwner?: { id: string; email: string; name?: string };
  // Staff signing details
  fullName?: string;
  icNumber?: string;
  signingEmail?: string;
  certSerialNo?: string;
  reason?: string;
  previousEmail?: string;
  newEmail?: string;
}

interface AuditLog {
  id: string;
  action: string;
  targetId: string | null;
  targetType: string | null;
  details: AuditLogDetails | null;
  ipAddress: string | null;
  createdAt: string;
  user: AuditLogUser;
}

interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  // User management actions
  USER_INVITED: { label: "User Invited", icon: UserPlus, variant: "default" },
  USER_ACTIVATED: { label: "User Activated", icon: UserCheck, variant: "default" },
  USER_DEACTIVATED: { label: "User Deactivated", icon: UserX, variant: "destructive" },
  USER_ROLE_CHANGED: { label: "Role Changed", icon: Shield, variant: "secondary" },
  USER_REMOVED: { label: "User Removed", icon: UserMinus, variant: "destructive" },
  LOGIN: { label: "Login", icon: User, variant: "outline" },
  // Tenant management actions
  TENANT_UPDATED: { label: "Company Updated", icon: Building2, variant: "secondary" },
  TENANT_LOGO_UPDATED: { label: "Logo Uploaded", icon: ImageIcon, variant: "default" },
  TENANT_LOGO_DELETED: { label: "Logo Deleted", icon: ImageIcon, variant: "destructive" },
  OWNERSHIP_TRANSFERRED: { label: "Ownership Transferred", icon: Crown, variant: "default" },
  // Staff signing actions
  STAFF_CERT_ENROLLED: { label: "Certificate Enrolled", icon: ShieldCheck, variant: "default" },
  STAFF_CERT_REVOKED: { label: "Certificate Revoked", icon: Ban, variant: "destructive" },
  STAFF_MTSA_EMAIL_UPDATED: { label: "Signing Email Updated", icon: Mail, variant: "secondary" },
};

function AdminLogsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-6 w-28 rounded-full shrink-0" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-full max-w-lg mt-2" />
        </CardHeader>
        <CardContent>
          <TableSkeleton
            headers={["Action", "Performed By", "Details", "IP Address", "Date"]}
            columns={[
              { badge: true, width: "w-28" },
              { subLine: true, width: "w-32" },
              { subLine: true, width: "w-44" },
              { width: "w-24" },
              { subLine: true, width: "w-28" },
            ]}
            rows={10}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/proxy/tenants/admin-logs?page=${page}&pageSize=15`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setLogs(data.data);
        setPagination(data.pagination);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error("Failed to fetch admin logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionConfig = (action: string) => {
    return ACTION_CONFIG[action] || { label: action, icon: Shield, variant: "outline" as const };
  };

  const formatDetails = (log: AuditLog): { main: string; secondary?: string } | null => {
    if (!log.details) return null;

    // Handle tenant update actions
    if (log.action === "TENANT_UPDATED") {
      const changes: string[] = [];
      const { previousData, newData } = log.details;
      
      if (newData?.name && newData.name !== previousData?.name) {
        changes.push(`Name: ${previousData?.name || "—"} → ${newData.name}`);
      }
      if (newData?.licenseNumber !== undefined && newData.licenseNumber !== previousData?.licenseNumber) {
        changes.push(`License: ${previousData?.licenseNumber || "—"} → ${newData.licenseNumber || "—"}`);
      }
      if (newData?.registrationNumber !== undefined && newData.registrationNumber !== previousData?.registrationNumber) {
        changes.push(`SSM: ${previousData?.registrationNumber || "—"} → ${newData.registrationNumber || "—"}`);
      }
      if (newData?.email !== undefined && newData.email !== previousData?.email) {
        changes.push(`Email: ${previousData?.email || "—"} → ${newData.email || "—"}`);
      }
      if (newData?.contactNumber !== undefined && newData.contactNumber !== previousData?.contactNumber) {
        changes.push(`Contact: ${previousData?.contactNumber || "—"} → ${newData.contactNumber || "—"}`);
      }
      if (newData?.businessAddress !== undefined && newData.businessAddress !== previousData?.businessAddress) {
        changes.push("Business address updated");
      }
      
      if (changes.length === 0) return { main: "No changes detected" };
      return { main: changes[0], secondary: changes.length > 1 ? `+${changes.length - 1} more changes` : undefined };
    }

    // Handle logo actions
    if (log.action === "TENANT_LOGO_UPDATED") {
      const dims = log.details.dimensions;
      return { 
        main: "Company logo uploaded", 
        secondary: dims ? `${dims.width}×${dims.height}px` : undefined 
      };
    }

    if (log.action === "TENANT_LOGO_DELETED") {
      return { main: "Company logo removed" };
    }

    // Handle ownership transfer
    if (log.action === "OWNERSHIP_TRANSFERRED") {
      const { previousOwner, newOwner } = log.details;
      return { 
        main: `${previousOwner?.email || "Unknown"} → ${newOwner?.email || "Unknown"}`,
        secondary: "Ownership transferred"
      };
    }

    // Handle staff signing actions
    if (log.action === "STAFF_CERT_ENROLLED") {
      return {
        main: log.details.fullName || "Unknown",
        secondary: `Signing email: ${log.details.signingEmail || "—"}`,
      };
    }

    if (log.action === "STAFF_CERT_REVOKED") {
      const reasonLabels: Record<string, string> = {
        keyCompromise: "Key Compromise",
        affiliationChanged: "Affiliation Changed",
        superseded: "Superseded",
        cessationOfOperation: "Cessation of Operation",
      };
      return {
        main: log.details.fullName || "Unknown",
        secondary: `Reason: ${reasonLabels[log.details.reason || ""] || log.details.reason || "—"}`,
      };
    }

    if (log.action === "STAFF_MTSA_EMAIL_UPDATED") {
      return {
        main: `${log.details.previousEmail || "—"} → ${log.details.newEmail || "—"}`,
        secondary: `${log.details.fullName || "Unknown"} — signing certificate email`,
      };
    }

    // Handle user management actions (existing logic)
    const main = log.details.email || "";
    let secondary: string | undefined;
    
    if (log.action === "USER_ROLE_CHANGED" && log.details.previousRole && log.details.newRole) {
      secondary = `${log.details.previousRole} → ${log.details.newRole}`;
    } else if (log.details.role) {
      secondary = `Role: ${log.details.role}`;
    }

    return main ? { main, secondary } : null;
  };

  return (
    <RoleGate allowedRoles={["OWNER", "ADMIN"]}>
    {loading && logs.length === 0 ? (
      <AdminLogsPageSkeleton />
    ) : (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Admin Logs</h1>
          <p className="text-base text-muted-foreground">Track user management, company settings, and administrative actions</p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Shield className="h-3.5 w-3.5 mr-1.5" />
          Admin Only
        </Badge>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            User management, company settings, and administrative actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-base text-muted-foreground">
              No admin logs yet. User management, company settings,
              signing certificate events, and ownership transfers will appear here.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const config = getActionConfig(log.action);
                    const Icon = config.icon;
                    const details = formatDetails(log);

                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.user.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{log.user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {details ? (
                            <div className="space-y-0.5">
                              <p>{details.main}</p>
                              {details.secondary && (
                                <p className="text-xs text-muted-foreground">{details.secondary}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {log.ipAddress || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{formatRelativeTime(log.createdAt)}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(currentPage - 1)}
                      disabled={currentPage <= 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(currentPage + 1)}
                      disabled={currentPage >= pagination.totalPages || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
    )}
    </RoleGate>
  );
}
