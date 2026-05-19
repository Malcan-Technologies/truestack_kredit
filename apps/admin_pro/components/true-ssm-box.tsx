"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	Building2,
	Loader2,
	Copy,
	Check,
	RefreshCw,
	AlertTriangle,
	ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import {
	formatCurrency,
	formatDate,
	formatSmartDateTime,
	safeMultiply,
} from "@/lib/utils";
import { getCountryName, getStateName } from "@/lib/address-options";

// ============================================
// Cost constants
// ============================================
// 154 credits @ RM 0.10/credit = RM 15.40 (TrueStack default template pricing).
// Surface these as constants so the cost confirmation modal stays in sync
// with the documented billing in apps/admin_pro/docs/TRUESSM_API.md.
const COMPANY_PROFILE_CREDITS = 154;
const CREDIT_TO_RM = 0.1;

function createSsmIdempotencyKey(borrowerId: string): string {
	const suffix =
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return `ssm-profile:${borrowerId}:${suffix}`;
}

function shouldRetainPullIdempotencyKey(
	status: number | undefined,
	code: string | undefined,
): boolean {
	return (
		status === 0 ||
		(typeof status === "number" && status >= 500) ||
		code === "REQUEST_IN_PROGRESS"
	);
}

const FIELD_LABELS: Record<string, string> = {
	companyName: "Company Name",
	ssmRegistrationNo: "SSM Registration No",
	dateOfIncorporation: "Date of Incorporation",
	paidUpCapital: "Paid-up Capital (RM)",
	natureOfBusiness: "Nature of Business",
	addressLine1: "Address Line 1",
	addressLine2: "Address Line 2",
	city: "City",
	state: "State",
	postcode: "Postcode",
	country: "Country",
};

// ============================================
// Types
// ============================================

export interface SsmFieldDiffEntry {
	field: string;
	label: string;
	current: string | null;
	incoming: string | null;
	action: "overwrite" | "fill" | "unchanged" | "no_data";
}

export interface SsmPullSummary {
	id: string;
	usageId: string | null;
	usageType: string;
	regNo: string;
	billedCredits: number;
	createdAt: string;
	documentId: string | null;
	document?: {
		id: string;
		originalName: string;
		category: string;
	} | null;
}

interface PullWithDiff extends SsmPullSummary {
	diff: {
		summary: {
			entityName: string | null;
			regNo: string | null;
			status: string | null;
		};
		fields: SsmFieldDiffEntry[];
	};
}

interface TrueSsmBoxProps {
	borrowerId: string;
	borrowerType: string;
	ssmRegistrationNo: string | null;
	lastSsmPull?: SsmPullSummary | null;
	/**
	 * Per-field provenance map from the borrower record. Used to decide whether
	 * the panel header shows a "Verified" or "Unverified" badge — verified means
	 * at least one field has been synced from a TrueSSM pull.
	 */
	ssmFieldProvenance?: Record<string, unknown> | null;
	canManage: boolean;
	/** Fired after a successful pull or sync so the parent can refresh borrower state. */
	onChanged?: () => void;
}

// ============================================
// Error mapping
// ============================================

/**
 * Map documented TrueSSM error codes to user-friendly copy. Anything we have
 * not explicitly mapped falls through to the API message so we never silence
 * provider errors.
 */
function describeSsmError(
	code: string | undefined | null,
	fallback: string,
): {
	title: string;
	description: string;
} {
	switch (code) {
		case "MISSING_REG_NO":
			return {
				title: "No SSM registration number",
				description:
					"Add the SSM Registration No to the company information section before pulling from TrueSSM\u2122.",
			};
		case "ENTITY_NOT_FOUND":
			return {
				title: "Entity not found",
				description:
					"TrueSSM\u2122 could not locate this registration number in SSM. Double-check the number on the borrower's Company Information.",
			};
		case "ENTITY_TYPE_MISMATCH":
			return {
				title: "Wrong report for this entity",
				description:
					"This registration is not a private/public company (ROC). The company profile report is only available for ROC entities.",
			};
		case "INSUFFICIENT_CREDITS":
			return {
				title: "Insufficient TrueStack credits",
				description:
					"Top up your TrueStack credit balance and try again.",
			};
		case "REPORT_NOT_FOUND":
			return {
				title: "Report unavailable",
				description:
					"SSM does not have a company profile for this entity right now. Try again later.",
			};
		case "REGISTRY_UNAVAILABLE":
		case "REGISTRY_ERROR":
			return {
				title: "Registry unavailable",
				description:
					"SSM responded with a temporary error. We did not bill any credits. Try again in a few minutes.",
			};
		case "IDEMPOTENCY_KEY_MISMATCH":
		case "REQUEST_IN_PROGRESS":
			return {
				title: "Request already in flight",
				description:
					"A pull for this borrower is already in progress. Wait a few seconds and refresh.",
			};
		case "NOT_CORPORATE":
			return {
				title: "Corporate borrowers only",
				description:
					"TrueSSM\u2122 pulls are only available for corporate borrowers.",
			};
		default:
			return { title: "Pull failed", description: fallback };
	}
}

// ============================================
// Component
// ============================================

/**
 * TrueSSM panel for the corporate borrower detail page.
 *
 * Visual language matches TrueIdentityBox so admins navigate both panels the
 * same way. The panel has three states:
 *   - **No reg no**: only a hint to add the SSM Registration No.
 *   - **Never pulled**: primary "Pull from SSM" CTA opens a cost confirmation.
 *   - **Pulled**: summary of last pull + Apply / Re-pull / Open PDF actions.
 */
export function TrueSsmBox({
	borrowerId,
	borrowerType,
	ssmRegistrationNo,
	lastSsmPull,
	ssmFieldProvenance,
	canManage,
	onChanged,
}: TrueSsmBoxProps) {
	const isCorporate = borrowerType === "CORPORATE";
	const hasRegNo = Boolean((ssmRegistrationNo ?? "").trim());
	// A borrower is considered TrueSSM-verified when at least one field carries
	// provenance from a successful pull. Matches the per-field "SSM" badges
	// shown next to Company Information / Address fields.
	const isVerified = Boolean(
		ssmFieldProvenance && Object.keys(ssmFieldProvenance).length > 0,
	);
	// Treat the panel as inactive when the borrower has no SSM registration number.
	// The visual matches TrueIdentityBox's `inactive` styling (dashed + muted) so
	// both panels look the same when there is nothing to act on.
	const inactive = !hasRegNo;

	const [pulling, setPulling] = useState(false);
	const [costModalOpen, setCostModalOpen] = useState(false);
	const [applyModalOpen, setApplyModalOpen] = useState(false);
	const [applyPull, setApplyPull] = useState<PullWithDiff | null>(null);
	const [applyLoading, setApplyLoading] = useState(false);
	const [applying, setApplying] = useState(false);
	const [pullIdempotencyKey, setPullIdempotencyKey] = useState<string | null>(
		null,
	);
	const [selectedFields, setSelectedFields] = useState<
		Record<string, boolean>
	>({});
	const [copied, setCopied] = useState(false);

	// Reset the in-flight pull attempt when the registration number changes.
	useEffect(() => {
		if (!hasRegNo) setCostModalOpen(false);
		setPullIdempotencyKey(null);
	}, [hasRegNo, ssmRegistrationNo]);

	const openCostModal = useCallback(() => {
		setPullIdempotencyKey(
			(existing) => existing ?? createSsmIdempotencyKey(borrowerId),
		);
		setCostModalOpen(true);
	}, [borrowerId]);

	const handleCopyUsageId = useCallback(async () => {
		if (!lastSsmPull?.usageId) return;
		try {
			await navigator.clipboard.writeText(lastSsmPull.usageId);
			setCopied(true);
			toast.success("Usage ID copied");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy usage ID");
		}
	}, [lastSsmPull?.usageId]);

	const doPull = useCallback(async () => {
		const idempotencyKey =
			pullIdempotencyKey ?? createSsmIdempotencyKey(borrowerId);
		setPullIdempotencyKey(idempotencyKey);
		setPulling(true);
		setCostModalOpen(false);
		try {
			const res = await api.post<PullWithDiff>(
				`/api/borrowers/${borrowerId}/ssm/pull`,
				{ idempotencyKey },
				{ headers: { "Idempotency-Key": idempotencyKey } },
			);
			if (!res.success || !res.data) {
				const err = describeSsmError(
					res.status === 400 ? undefined : undefined,
					res.error || "Failed to pull from SSM",
				);
				// Backend returns `code` on AppErrors; api wrapper merges into response.
				const code = (res as unknown as { code?: string }).code;
				if (!shouldRetainPullIdempotencyKey(res.status, code)) {
					setPullIdempotencyKey(null);
				}
				const mapped = describeSsmError(
					code,
					res.error || err.description,
				);
				toast.error(mapped.title, { description: mapped.description });
				return;
			}
			const cost = res.data.billedCredits || COMPANY_PROFILE_CREDITS;
			toast.success(
				`Pulled TrueSSM\u2122 profile (${cost} credits / ${formatCurrency(safeMultiply(cost, CREDIT_TO_RM))})`,
			);
			// Open Apply modal immediately with the fresh diff so the admin can act.
			setApplyPull(res.data);
			setSelectedFields(buildDefaultSelection(res.data.diff.fields));
			setApplyModalOpen(true);
			setPullIdempotencyKey(null);
			onChanged?.();
		} finally {
			setPulling(false);
		}
	}, [borrowerId, onChanged, pullIdempotencyKey]);

	const openApplyForExistingPull = useCallback(async () => {
		if (!lastSsmPull) return;
		setApplyLoading(true);
		setApplyModalOpen(true);
		try {
			const res = await api.get<PullWithDiff>(
				`/api/borrowers/${borrowerId}/ssm/pulls/${lastSsmPull.id}`,
			);
			if (!res.success || !res.data) {
				toast.error(res.error || "Failed to load SSM pull");
				setApplyModalOpen(false);
				return;
			}
			setApplyPull(res.data);
			setSelectedFields(buildDefaultSelection(res.data.diff.fields));
		} finally {
			setApplyLoading(false);
		}
	}, [borrowerId, lastSsmPull]);

	const doApply = useCallback(async () => {
		if (!applyPull) return;
		const fields = Object.entries(selectedFields)
			.filter(([, checked]) => checked)
			.map(([field]) => field);
		// Empty `fields` is allowed when there are unchanged-with-data rows — the
		// backend will still write provenance for those, so applying is meaningful.
		const hasAutoVerify = applyPull.diff.fields.some(
			(f) => f.action === "unchanged" && f.incoming !== null,
		);
		if (fields.length === 0 && !hasAutoVerify) {
			toast.error("Select at least one field to apply");
			return;
		}
		setApplying(true);
		try {
			const res = await api.post<{
				appliedFields: string[];
				verifiedFields?: string[];
			}>(`/api/borrowers/${borrowerId}/ssm/sync`, {
				pullId: applyPull.id,
				fields,
			});
			if (!res.success || !res.data) {
				const code = (res as unknown as { code?: string }).code;
				const mapped = describeSsmError(
					code,
					res.error || "Failed to apply SSM data",
				);
				toast.error(mapped.title, { description: mapped.description });
				return;
			}
			const applied = res.data.appliedFields.length;
			const verified = res.data.verifiedFields?.length ?? 0;
			if (applied > 0 && verified > 0) {
				toast.success(
					`Applied ${applied} field${applied === 1 ? "" : "s"} from TrueSSM\u2122`,
					{
						description: `${verified} matching field${verified === 1 ? "" : "s"} also marked as verified.`,
					},
				);
			} else if (applied > 0) {
				toast.success(
					`Applied ${applied} field${applied === 1 ? "" : "s"} from TrueSSM\u2122`,
				);
			} else if (verified > 0) {
				toast.success(
					`Verified ${verified} field${verified === 1 ? "" : "s"} against TrueSSM\u2122`,
				);
			} else {
				toast.success("TrueSSM\u2122 sync complete");
			}
			setApplyModalOpen(false);
			onChanged?.();
		} finally {
			setApplying(false);
		}
	}, [applyPull, borrowerId, onChanged, selectedFields]);

	// Rows the user can actually tick: rows with new data that either replace
	// an existing value (`overwrite`) or fill an empty field (`fill`).
	// `unchanged` and `no_data` rows are handled automatically by the backend
	// and stay non-interactive in the UI.
	const selectableFields = useMemo(() => {
		if (!applyPull) return [];
		return applyPull.diff.fields.filter(
			(f) => f.action === "overwrite" || f.action === "fill",
		);
	}, [applyPull]);

	const totalSelectable = selectableFields.length;

	const allSelectableChecked =
		totalSelectable > 0 &&
		selectableFields.every((f) => selectedFields[f.field]);

	const toggleSelectAll = useCallback(() => {
		const targetValue = !allSelectableChecked;
		setSelectedFields((prev) => {
			const next = { ...prev };
			for (const f of selectableFields) {
				next[f.field] = targetValue;
			}
			return next;
		});
	}, [allSelectableChecked, selectableFields]);

	// Fields where the borrower's existing value already matches SSM. The sync
	// endpoint stamps these with provenance automatically, so applying always
	// does something useful even when nothing differs.
	const autoVerifyCount = useMemo(() => {
		if (!applyPull) return 0;
		return applyPull.diff.fields.filter(
			(f) => f.action === "unchanged" && f.incoming !== null,
		).length;
	}, [applyPull]);

	const selectedCount = useMemo(
		() => Object.values(selectedFields).filter(Boolean).length,
		[selectedFields],
	);

	const applyEnabled = selectedCount > 0 || autoVerifyCount > 0;

	if (!isCorporate) return null;

	return (
		<>
			<Card
				className={
					inactive
						? "opacity-50 border-dashed border-muted-foreground/30"
						: "bg-emerald-500/[0.04] border-emerald-500/15"
				}
			>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between gap-2">
						<CardTitle className="text-lg font-heading flex items-center gap-2">
							<Building2
								className={`h-5 w-5 ${
									inactive
										? "text-muted-foreground"
										: "text-emerald-700 dark:text-emerald-500"
								}`}
							/>
							TrueSSM&trade;
						</CardTitle>
						{!inactive &&
							(isVerified ? (
								<Badge variant="verified" className="text-xs">
									<Building2 className="h-3 w-3 mr-1" />
									SSM Verified
								</Badge>
							) : (
								<Badge
									variant="secondary"
									className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
								>
									Unverified
								</Badge>
							))}
					</div>
					<CardDescription>
						Pull a verified company profile directly from SSM
						(Suruhanjaya Syarikat Malaysia).
						<span className="block mt-1 text-[11px] text-muted-foreground/80">
							In partnership with{" "}
							<span className="font-medium">ssmsearch.com</span>
						</span>
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{!hasRegNo && (
						<div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
							<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
							<div className="text-sm">
								<p className="font-medium">
									No SSM Registration No on file
								</p>
								<p className="text-muted-foreground mt-0.5">
									Add the SSM Registration No in the Company
									Information section above to enable TrueSSM
									lookups.
								</p>
							</div>
						</div>
					)}

					{hasRegNo && !lastSsmPull && (
						<div className="space-y-3">
							<p className="text-sm text-muted-foreground">
								Verify and auto-fill borrower fields by pulling
								the latest company profile from TrueSSM&trade;.
								Each pull is billed at{" "}
								<span className="font-medium text-foreground">
									{COMPANY_PROFILE_CREDITS} credits (
									{formatCurrency(
										safeMultiply(
											COMPANY_PROFILE_CREDITS,
											CREDIT_TO_RM,
										),
									)}
									)
								</span>
								.
							</p>
							<Button
								onClick={openCostModal}
								disabled={!canManage || pulling}
								size="sm"
								className="w-full sm:w-auto"
							>
								{pulling ? (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								) : (
									<Building2 className="h-4 w-4 mr-2" />
								)}
								Pull from TrueSSM&trade;
							</Button>
							{!canManage && (
								<p className="text-xs text-muted-foreground">
									You do not have permission to pull from
									TrueSSM&trade;.
								</p>
							)}
						</div>
					)}

					{hasRegNo && lastSsmPull && (
						<div className="space-y-3">
							<div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3 space-y-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm font-medium">
										Last pulled
									</p>
									<Badge
										variant="outline"
										className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700"
									>
										{lastSsmPull.usageType.replace(
											/_/g,
											" ",
										)}
									</Badge>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
									<div>
										<p className="text-muted-foreground">
											When
										</p>
										<p className="font-medium">
											{formatSmartDateTime(
												lastSsmPull.createdAt,
											)}
										</p>
									</div>
									{lastSsmPull.usageId && (
										<div>
											<p className="text-muted-foreground">
												Usage ID
											</p>
											<button
												type="button"
												onClick={handleCopyUsageId}
												className="font-medium font-mono inline-flex items-center gap-1 hover:text-emerald-600 transition-colors"
											>
												<span className="truncate max-w-[140px]">
													{lastSsmPull.usageId}
												</span>
												{copied ? (
													<Check className="h-3 w-3 text-green-500" />
												) : (
													<Copy className="h-3 w-3" />
												)}
											</button>
										</div>
									)}
								</div>
								{lastSsmPull.documentId && (
									<Link
										href="#borrower-documents"
										className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline"
									>
										<ExternalLink className="h-3 w-3" />
										Saved PDF in borrower documents
									</Link>
								)}
							</div>

							<div className="flex flex-wrap gap-2">
								<Button
									onClick={openApplyForExistingPull}
									size="sm"
									disabled={!canManage}
								>
									Apply to borrower
								</Button>
								<Button
									onClick={openCostModal}
									variant="outline"
									size="sm"
									disabled={!canManage || pulling}
								>
									{pulling ? (
										<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
									) : (
										<RefreshCw className="h-3.5 w-3.5 mr-2" />
									)}
									Re-pull
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Cost confirmation modal */}
			<Dialog open={costModalOpen} onOpenChange={setCostModalOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Building2 className="h-5 w-5" />
							Confirm TrueSSM&trade; pull
						</DialogTitle>
						<DialogDescription>
							Each pull is billed against your TrueStack credit
							balance.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 text-sm">
						<div className="rounded-md border border-border bg-secondary/40 p-3 space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">
									Cost
								</span>
								<span className="font-medium">
									{COMPANY_PROFILE_CREDITS} credits ·{" "}
									{formatCurrency(
										safeMultiply(
											COMPANY_PROFILE_CREDITS,
											CREDIT_TO_RM,
										),
									)}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">
									Registration No
								</span>
								<span className="font-mono">
									{ssmRegistrationNo}
								</span>
							</div>
						</div>
						<ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
							<li>
								Saves the company profile as a PDF in this
								borrower&apos;s documents.
							</li>
							<li>
								Lets you overwrite borrower fields (company
								name, address, paid-up capital, etc).
							</li>
							<li>
								You will not be billed if the entity is not
								found or the wrong type.
							</li>
						</ul>
						<p className="text-[11px] text-muted-foreground/80">
							TrueSSM&trade; is delivered in partnership with{" "}
							<span className="font-medium">ssmsearch.com</span>,
							sourcing data directly from Suruhanjaya Syarikat
							Malaysia (SSM).
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCostModalOpen(false)}
							disabled={pulling}
						>
							Cancel
						</Button>
						<Button
							onClick={doPull}
							disabled={pulling || !canManage}
						>
							{pulling ? (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<Building2 className="h-4 w-4 mr-2" />
							)}
							Confirm pull
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Apply-to-borrower modal */}
			<Dialog
				open={applyModalOpen}
				onOpenChange={(open) => !applying && setApplyModalOpen(open)}
			>
				<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							Apply TrueSSM&trade; data to borrower
						</DialogTitle>
						<DialogDescription>
							Choose which fields to overwrite. Empty fields are
							pre-checked; conflicting fields are not. Matching
							fields are automatically marked as verified.
						</DialogDescription>
					</DialogHeader>

					{applyLoading || !applyPull ? (
						<div className="py-10 flex items-center justify-center">
							<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					) : (
						<div className="space-y-3">
							{applyPull.diff.summary.entityName && (
								<div className="rounded-md border border-border bg-secondary/40 p-3">
									<p className="text-xs text-muted-foreground">
										TrueSSM&trade; Entity
									</p>
									<p className="text-sm font-medium">
										{applyPull.diff.summary.entityName}
									</p>
									{applyPull.diff.summary.status && (
										<p className="text-xs text-muted-foreground mt-0.5">
											Status:{" "}
											{applyPull.diff.summary.status}
										</p>
									)}
								</div>
							)}

							{totalSelectable > 0 && (
								<div className="flex items-center justify-between gap-2 px-1">
									<p className="text-xs text-muted-foreground">
										{selectedCount} of {totalSelectable}{" "}
										{totalSelectable === 1 ? "field" : "fields"}{" "}
										selected
										{autoVerifyCount > 0 && (
											<span>
												{" "}
												·{" "}
												<span className="text-emerald-700 dark:text-emerald-400">
													{autoVerifyCount} auto-verified
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

							<div className="rounded-md border border-border divide-y divide-border">
								{applyPull.diff.fields.map((entry) => {
									const disabled =
										entry.action === "no_data" ||
										entry.action === "unchanged";
									// Unchanged-with-data rows are not user-selectable but still
									// get verified, so we render them at full opacity (just
									// non-interactive) to make that visually obvious.
									const fadeDisabled =
										entry.action === "no_data";
									// "Will verify" rows display a locked-checked checkbox so it
									// is obvious the field will be acted on, even though the
									// user can't toggle it. Backend writes provenance regardless.
									const checked =
										entry.action === "unchanged" &&
										entry.incoming !== null
											? true
											: !!selectedFields[entry.field];
									return (
										<div key={entry.field} className="p-3">
											<label
												className={`flex items-start gap-3 ${
													disabled
														? "cursor-not-allowed"
														: "cursor-pointer"
												} ${fadeDisabled ? "opacity-60" : ""}`}
											>
												<Checkbox
													checked={checked}
													disabled={disabled}
													onCheckedChange={(
														value,
													) => {
														setSelectedFields(
															(prev) => ({
																...prev,
																[entry.field]:
																	value ===
																	true,
															}),
														);
													}}
													className="mt-0.5"
												/>
												<div className="flex-1 min-w-0 space-y-1">
													<div className="flex items-center justify-between gap-2">
														<p className="text-sm font-medium">
															{FIELD_LABELS[
																entry.field
															] ?? entry.label}
														</p>
														<Badge
															variant="outline"
															className={badgeClassForAction(
																entry.action,
															)}
														>
															{labelForAction(
																entry.action,
															)}
														</Badge>
													</div>
													<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
														<div className="min-w-0">
															<p className="text-muted-foreground">
																Current
															</p>
															<p className="font-mono break-words">
																{entry.current ? (
																	formatFieldValue(
																		entry.field,
																		entry.current,
																	)
																) : (
																	<span className="italic text-muted-foreground">
																		(empty)
																	</span>
																)}
															</p>
														</div>
														<div className="min-w-0">
															<p className="text-muted-foreground">
																TrueSSM&trade;
															</p>
															<p className="font-mono break-words">
																{entry.incoming ? (
																	formatFieldValue(
																		entry.field,
																		entry.incoming,
																	)
																) : (
																	<span className="italic text-muted-foreground">
																		(no
																		data)
																	</span>
																)}
															</p>
														</div>
													</div>
												</div>
											</label>
										</div>
									);
								})}
							</div>

							{totalSelectable === 0 && autoVerifyCount > 0 && (
								<p className="text-xs text-emerald-700 dark:text-emerald-400">
									All TrueSSM&trade; values match the borrower
									record. Click Apply to mark{" "}
									{autoVerifyCount} field
									{autoVerifyCount === 1 ? "" : "s"} as
									verified.
								</p>
							)}
							{totalSelectable === 0 && autoVerifyCount === 0 && (
								<p className="text-xs text-muted-foreground italic">
									Nothing to apply — TrueSSM&trade; returned
									no data for the mappable fields.
								</p>
							)}
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setApplyModalOpen(false)}
							disabled={applying}
						>
							Cancel
						</Button>
						<Button
							onClick={doApply}
							disabled={applying || !applyEnabled || !canManage}
						>
							{applying && (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							)}
							{selectedCount > 0
								? `Apply ${selectedCount} field${selectedCount === 1 ? "" : "s"}`
								: `Verify ${autoVerifyCount} field${autoVerifyCount === 1 ? "" : "s"}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function buildDefaultSelection(
	fields: SsmFieldDiffEntry[],
): Record<string, boolean> {
	const out: Record<string, boolean> = {};
	for (const entry of fields) {
		// Pre-check fields that fill an empty value. Conflicts default to unchecked
		// so staff explicitly opts in to overwriting an existing value.
		out[entry.field] = entry.action === "fill";
	}
	return out;
}

/**
 * Render a diff value the way it should appear to admins:
 * - `state` is stored as ISO 3166-2 (e.g. `MY-14`); show the readable name (`W.P. Kuala Lumpur`).
 * - `country` is stored as ISO 3166-1 alpha-2 (e.g. `MY`); show the country name with flag.
 * - `dateOfIncorporation` is stored as a `yyyy-mm-dd` string; show as `30 Jan 2026`.
 * - `paidUpCapital` is stored as a numeric string; show as `RM 1,135,511,271.55`.
 * - Everything else passes through verbatim.
 */
function formatFieldValue(field: string, value: string): string {
	switch (field) {
		case "state":
			return getStateName("MY", value) ?? value;
		case "country":
			return getCountryName(value) ?? value;
		case "dateOfIncorporation":
			return formatDate(value);
		case "paidUpCapital": {
			const num = Number(value);
			return Number.isFinite(num) ? formatCurrency(num) : value;
		}
		default:
			return value;
	}
}

function labelForAction(action: SsmFieldDiffEntry["action"]): string {
	switch (action) {
		case "overwrite":
			return "Will overwrite";
		case "fill":
			return "Will fill";
		case "unchanged":
			return "Will verify";
		case "no_data":
			return "No SSM data";
	}
}

function badgeClassForAction(action: SsmFieldDiffEntry["action"]): string {
	switch (action) {
		case "overwrite":
			return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700";
		case "fill":
			return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700";
		case "unchanged":
			return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/60 dark:border-emerald-700/60";
		case "no_data":
			return "bg-muted text-muted-foreground";
	}
}
