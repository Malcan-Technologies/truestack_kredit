"use client";

/**
 * Director-sync modal for TrueSSM™ Registry Insights.
 *
 * Opens from the "Officers" tab of `<TrueSsmInsights>` (or anywhere with a
 * `pullId` to apply). Mirrors the visual language of `<TrueSsmBox>`'s
 * apply-to-borrower modal but with different per-row controls because each
 * SSM officer maps to one of three independent actions:
 *
 *   - `add`     → SSM has this director, we don't. Pre-checked.
 *   - `update`  → IC match, name differs. Pre-checked.
 *   - `verify`  → IC + name match. Locked-on (we always stamp provenance).
 *
 * Borrower directors that aren't in the SSM officer list ("orphans") surface
 * as advisory rows below the main list. Removal is opt-in and disabled when
 * the director has e-KYC progress or is the authorised representative — the
 * backend enforces this too.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  UserPlus,
  UserCheck,
  UserCog,
  UserX,
  AlertTriangle,
  Fingerprint,
  Crown,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

/* --------------------------------- types ---------------------------------- */

interface DirectorDiffEntry {
  icNumber: string;
  icNumberRaw: string;
  ssmName: string;
  idTypeLabel: string | null;
  startDate: string | null;
  action: "add" | "update" | "verify";
  match: {
    id: string;
    name: string;
    position: string | null;
    isAuthorizedRepresentative: boolean;
    hasEkyc: boolean;
    hasCompletedEkyc: boolean;
  } | null;
  changes: {
    name?: { from: string; to: string };
  };
}

interface DirectorOrphan {
  id: string;
  name: string;
  icNumber: string;
  position: string | null;
  isAuthorizedRepresentative: boolean;
  hasEkyc: boolean;
  hasCompletedEkyc: boolean;
}

interface DirectorPreviewResponse {
  pull: {
    id: string;
    usageId: string | null;
    regNo: string;
    createdAt: string;
  };
  summary: {
    entityName: string | null;
    regNo: string | null;
  };
  diff: DirectorDiffEntry[];
  orphans: DirectorOrphan[];
}

interface TrueSsmDirectorSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrowerId: string;
  pullId: string;
  canManage: boolean;
  onSynced?: () => void;
}

/* --------------------------------- ui bits -------------------------------- */

interface ActionMeta {
  label: string;
  badgeClass: string;
  icon: typeof UserPlus;
}

const ACTION_META: Record<DirectorDiffEntry["action"], ActionMeta> = {
  add: {
    label: "Add",
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    icon: UserPlus,
  },
  update: {
    label: "Update",
    badgeClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    icon: UserCog,
  },
  verify: {
    label: "Verify",
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    icon: UserCheck,
  },
};

/* --------------------------------- main ----------------------------------- */

export function TrueSsmDirectorSyncModal({
  open,
  onOpenChange,
  borrowerId,
  pullId,
  canManage,
  onSynced,
}: TrueSsmDirectorSyncModalProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DirectorPreviewResponse | null>(null);
  const [applying, setApplying] = useState(false);
  // Selections keyed by canonical IC for diff rows; orphan IDs for removal.
  const [selectedIcs, setSelectedIcs] = useState<Record<string, boolean>>({});
  const [removeOrphanIds, setRemoveOrphanIds] = useState<Record<string, boolean>>({});

  // Load preview when the modal opens (or pull changes).
  useEffect(() => {
    if (!open || !pullId) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setSelectedIcs({});
    setRemoveOrphanIds({});
    (async () => {
      const res = await api.get<DirectorPreviewResponse>(
        `/api/borrowers/${borrowerId}/ssm/pulls/${pullId}/directors`,
      );
      if (cancelled) return;
      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to load director sync preview");
        onOpenChange(false);
        return;
      }
      setPreview(res.data);
      // Default selection: every `add` and `update` row is pre-checked.
      // `verify` rows are locked-on (rendered as checked-disabled). Orphans
      // start unchecked so removal is opt-in.
      const initial: Record<string, boolean> = {};
      for (const entry of res.data.diff) {
        if (entry.action !== "verify") initial[entry.icNumber] = true;
      }
      setSelectedIcs(initial);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pullId, borrowerId, onOpenChange]);

  const verifyOnlyIcs = useMemo(
    () =>
      (preview?.diff ?? [])
        .filter((e) => e.action === "verify")
        .map((e) => e.icNumber),
    [preview],
  );

  const selectableIcs = useMemo(
    () =>
      (preview?.diff ?? [])
        .filter((e) => e.action !== "verify")
        .map((e) => e.icNumber),
    [preview],
  );

  const selectedCount = useMemo(
    () => selectableIcs.filter((ic) => selectedIcs[ic]).length,
    [selectableIcs, selectedIcs],
  );

  const removalCount = useMemo(
    () => Object.values(removeOrphanIds).filter(Boolean).length,
    [removeOrphanIds],
  );

  const totalOps = selectedCount + verifyOnlyIcs.length + removalCount;

  const allSelectableChecked =
    selectableIcs.length > 0 && selectableIcs.every((ic) => selectedIcs[ic]);

  const toggleSelectAll = useCallback(() => {
    const next = !allSelectableChecked;
    setSelectedIcs((prev) => {
      const updated = { ...prev };
      for (const ic of selectableIcs) updated[ic] = next;
      return updated;
    });
  }, [allSelectableChecked, selectableIcs]);

  const doSync = useCallback(async () => {
    if (!preview) return;
    if (totalOps === 0) {
      toast.error("Nothing selected to sync");
      return;
    }
    const operations: Array<{
      icNumber: string;
      action: "add" | "update" | "verify" | "remove";
    }> = [];

    for (const entry of preview.diff) {
      if (entry.action === "verify") {
        operations.push({ icNumber: entry.icNumber, action: "verify" });
      } else if (selectedIcs[entry.icNumber]) {
        operations.push({ icNumber: entry.icNumber, action: entry.action });
      }
    }
    for (const orphan of preview.orphans) {
      if (removeOrphanIds[orphan.id]) {
        operations.push({ icNumber: orphan.icNumber, action: "remove" });
      }
    }

    setApplying(true);
    try {
      const res = await api.post<{
        added: string[];
        updated: string[];
        verified: string[];
        removed: string[];
      }>(`/api/borrowers/${borrowerId}/ssm/directors/sync`, {
        pullId: preview.pull.id,
        operations,
      });
      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to sync directors");
        return;
      }
      const parts: string[] = [];
      if (res.data.added.length) parts.push(`${res.data.added.length} added`);
      if (res.data.updated.length) parts.push(`${res.data.updated.length} updated`);
      if (res.data.verified.length) parts.push(`${res.data.verified.length} verified`);
      if (res.data.removed.length) parts.push(`${res.data.removed.length} removed`);
      toast.success("Directors synced from TrueSSM\u2122", {
        description: parts.join(" · ") || undefined,
      });
      onSynced?.();
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  }, [
    preview,
    selectedIcs,
    removeOrphanIds,
    totalOps,
    borrowerId,
    onSynced,
    onOpenChange,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !applying && onOpenChange(value)}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync directors from TrueSSM&trade;</DialogTitle>
          <DialogDescription>
            Match SSM-registered directors against this borrower&apos;s roster. New
            directors are added; existing matches are updated or verified.
            Borrower directors not in SSM are flagged but never auto-removed.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Entity summary */}
            {preview.summary.entityName && (
              <div className="rounded-md border border-border bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">
                  TrueSSM&trade; Entity
                </p>
                <p className="text-sm font-medium">
                  {preview.summary.entityName}
                </p>
                {preview.summary.regNo && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {preview.summary.regNo}
                  </p>
                )}
              </div>
            )}

            {/* Header / select-all */}
            {selectableIcs.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs text-muted-foreground">
                  {selectedCount} of {selectableIcs.length}{" "}
                  {selectableIcs.length === 1 ? "director" : "directors"}{" "}
                  selected
                  {verifyOnlyIcs.length > 0 && (
                    <span>
                      {" "}
                      ·{" "}
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {verifyOnlyIcs.length} auto-verified
                      </span>
                    </span>
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-300"
                  onClick={toggleSelectAll}
                >
                  {allSelectableChecked ? "Deselect all" : "Select all"}
                </Button>
              </div>
            )}

            {/* SSM-side rows */}
            {preview.diff.length > 0 ? (
              <div className="rounded-md border border-border divide-y divide-border">
                {preview.diff.map((entry) => (
                  <DirectorRow
                    key={entry.icNumber}
                    entry={entry}
                    checked={
                      entry.action === "verify"
                        ? true
                        : !!selectedIcs[entry.icNumber]
                    }
                    onCheckedChange={(value) => {
                      if (entry.action === "verify") return;
                      setSelectedIcs((prev) => ({
                        ...prev,
                        [entry.icNumber]: value,
                      }));
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No directors returned by SSM for this entity.
                </p>
              </div>
            )}

            {/* Orphans */}
            {preview.orphans.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                    <h4 className="text-sm font-semibold">
                      Not in SSM ({preview.orphans.length})
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    These borrower directors don&apos;t appear in the SSM officer
                    list. Review manually — directors with e-KYC progress
                    cannot be removed via sync.
                  </p>
                  <div className="rounded-md border border-border divide-y divide-border">
                    {preview.orphans.map((orphan) => (
                      <OrphanRow
                        key={orphan.id}
                        orphan={orphan}
                        checked={!!removeOrphanIds[orphan.id]}
                        onCheckedChange={(value) =>
                          setRemoveOrphanIds((prev) => ({
                            ...prev,
                            [orphan.id]: value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            onClick={doSync}
            disabled={applying || loading || totalOps === 0 || !canManage}
          >
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {totalOps > 0
              ? `Apply ${totalOps} change${totalOps === 1 ? "" : "s"}`
              : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ row components ---------------------------- */

function DirectorRow({
  entry,
  checked,
  onCheckedChange,
}: {
  entry: DirectorDiffEntry;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  const meta = ACTION_META[entry.action];
  const ActionIcon = meta.icon;
  const locked = entry.action === "verify";

  return (
    <div className="p-3">
      <label
        className={cn(
          "flex items-start gap-3",
          locked ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={locked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title row: name + designation pill */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{entry.ssmName || "—"}</p>
            <Badge
              variant="outline"
              className={cn("text-[10px] gap-1 shrink-0", meta.badgeClass)}
            >
              <ActionIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
          </div>

          {/* Identity strip */}
          <p className="text-xs text-muted-foreground font-mono break-all">
            {entry.idTypeLabel ? `${entry.idTypeLabel} · ` : ""}
            {entry.icNumberRaw}
            {entry.startDate && (
              <span className="font-sans">
                {" "}
                · Since {formatDateSafe(entry.startDate)}
              </span>
            )}
          </p>

          {/* Action-specific detail */}
          {entry.action === "update" && entry.changes.name && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-2 py-1.5 text-xs space-y-0.5">
              <p className="text-muted-foreground">Name will change:</p>
              <p className="font-mono">
                <span className="line-through opacity-70">
                  {entry.changes.name.from || "(empty)"}
                </span>{" "}
                → <span className="font-semibold">{entry.changes.name.to}</span>
              </p>
            </div>
          )}
          {entry.action === "add" && (
            <p className="text-xs text-muted-foreground italic">
              Will be added as a new director (Position: Director). E-KYC must
              be initiated separately.
            </p>
          )}
          {entry.action === "verify" && (
            <p className="text-xs text-muted-foreground italic">
              Matches the borrower record. Will be marked as SSM-verified.
            </p>
          )}

          {/* Match meta: e-KYC + authorized rep */}
          {entry.match && (
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.match.isAuthorizedRepresentative && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"
                >
                  <Crown className="h-3 w-3" />
                  Authorised Rep
                </Badge>
              )}
              {entry.match.hasCompletedEkyc && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                >
                  <Fingerprint className="h-3 w-3" />
                  e-KYC Verified
                </Badge>
              )}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}

function OrphanRow({
  orphan,
  checked,
  onCheckedChange,
}: {
  orphan: DirectorOrphan;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  // Removal is only hard-blocked when the director has e-KYC progress (the
  // backend would reject it anyway). Removing the authorised rep is allowed
  // — the backend auto-promotes the lowest-order remaining director, so we
  // surface that as a soft warning instead of disabling the checkbox.
  const disabled = orphan.hasEkyc;
  const hardLockReason = orphan.hasEkyc
    ? "Has e-KYC progress and cannot be removed via sync."
    : null;
  const softWarning =
    !disabled && checked && orphan.isAuthorizedRepresentative
      ? "Removing the authorised representative — another director will be auto-promoted. You can reassign manually afterwards."
      : null;

  return (
    <div className={cn("p-3", disabled && "opacity-90")}>
      <label
        className={cn(
          "flex items-start gap-3",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{orphan.name}</p>
            <Badge
              variant="outline"
              className="text-[10px] gap-1 shrink-0 bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
            >
              <UserX className="h-3 w-3" />
              {checked ? "Remove" : "Flag"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono break-all">
            {orphan.icNumber}
            {orphan.position && (
              <span className="font-sans"> · {orphan.position}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {orphan.isAuthorizedRepresentative && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"
              >
                <Crown className="h-3 w-3" />
                Authorised Rep
              </Badge>
            )}
            {orphan.hasCompletedEkyc && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              >
                <Fingerprint className="h-3 w-3" />
                e-KYC Verified
              </Badge>
            )}
          </div>
          {hardLockReason && (
            <p className="text-[11px] text-muted-foreground italic">
              {hardLockReason}
            </p>
          )}
          {softWarning && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
              {softWarning}
            </p>
          )}
        </div>
      </label>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function formatDateSafe(value: string): string {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value;
  try {
    return formatDate(datePart);
  } catch {
    return datePart;
  }
}
