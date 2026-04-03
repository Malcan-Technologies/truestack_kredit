"use client";

import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime } from "@/lib/utils";

interface LoginLog {
  id: string;
  ipAddress: string | null;
  deviceType: string | null;
  createdAt: string;
}

interface LoginActivityCardProps {
  loginLogs: LoginLog[];
}

export function LoginActivityCard({ loginLogs }: LoginActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="font-heading">Recent Login Activity</CardTitle>
            <CardDescription>Your recent sign-in history across devices</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loginLogs.length > 0 ? (
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
                    <span title={formatDate(log.createdAt)}>{formatRelativeTime(log.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.deviceType || "Unknown"}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{log.ipAddress || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No login history available.</p>
        )}
      </CardContent>
    </Card>
  );
}
