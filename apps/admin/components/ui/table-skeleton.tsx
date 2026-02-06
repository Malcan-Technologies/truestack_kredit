import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ColumnDef {
  /** Width class for the skeleton bar, e.g. "w-32", "w-20" */
  width?: string;
  /** Whether to show a second smaller line beneath (e.g. for name + IC) */
  subLine?: boolean;
  /** Whether to render as a small badge-like skeleton */
  badge?: boolean;
  /** Whether to render as a circle (e.g. for donut/icon) */
  circle?: boolean;
}

interface TableSkeletonProps {
  /** Column headers to display */
  headers: string[];
  /** Column skeleton definitions — should match headers length */
  columns: ColumnDef[];
  /** Number of skeleton rows to render */
  rows?: number;
}

export function TableSkeleton({ headers, columns, rows = 5 }: TableSkeletonProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((col, colIndex) => (
              <TableCell key={colIndex}>
                {col.circle ? (
                  <Skeleton className="h-8 w-8 rounded-full" />
                ) : col.badge ? (
                  <Skeleton className={`h-5 ${col.width || "w-16"} rounded-full`} />
                ) : col.subLine ? (
                  <div className="space-y-1.5">
                    <Skeleton className={`h-4 ${col.width || "w-28"}`} />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ) : (
                  <Skeleton className={`h-4 ${col.width || "w-24"}`} />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
