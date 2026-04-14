"use client";

import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { formatRelativeTime } from "../lib/format-relative-time";
import { formatDate } from "../lib/borrower-form-display";

interface LoginLog {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

function formatRelativeTimeSafe(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? "—" : formatRelativeTime(d);
  } catch {
    return "—";
  }
}

interface AccountLoginActivityCardProps {
  className?: string;
}

export function AccountLoginActivityCard({ className }: AccountLoginActivityCardProps) {
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proxy/auth/login-history", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setLoginLogs(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="font-heading">Recent Login Activity</CardTitle>
            <CardDescription>
              Your recent sign-in history across devices
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="rounded-md border border-border" role="status" aria-label="Loading login history">
            <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, row) => (
              <div key={row} className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : loginLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & Time</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loginLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <span title={formatDate(log.createdAt)}>
                      {formatRelativeTimeSafe(log.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.deviceType || "Unknown"}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.ipAddress || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No login history available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
