import type { BorrowerProduct } from "@kredit/borrower";

export function toAmountNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  return Number(v);
}

export function validateLoanDetailsStep(params: {
  product: BorrowerProduct;
  amount: number | "";
  term: number | "";
  collateralType: string;
  collateralValue: number | "";
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const minA = toAmountNumber(params.product.minAmount);
  const maxA = toAmountNumber(params.product.maxAmount);
  const amt = params.amount === "" ? 0 : params.amount;
  if (amt <= 0) errors.amount = "Enter a loan amount";
  else if (amt < minA || amt > maxA) {
    errors.amount = `Amount must be between RM ${minA.toLocaleString()} and RM ${maxA.toLocaleString()}`;
  }

  const term = params.term === "" ? 0 : params.term;
  if (term <= 0) errors.term = "Select a loan term";
  else if (term < params.product.minTerm || term > params.product.maxTerm) {
    errors.term = `Term must be ${params.product.minTerm}–${params.product.maxTerm} months`;
  }

  if (params.product.loanScheduleType === "JADUAL_K") {
    if (!params.collateralType.trim()) errors.collateralType = "Collateral type is required";
    const cv = params.collateralValue === "" ? 0 : params.collateralValue;
    if (cv <= 0) errors.collateralValue = "Collateral value is required";
  }

  return errors;
}

/** True if every required document key has at least one uploaded file. */
export function requiredDocumentsSatisfied(
  requiredDocs: { key: string; required: boolean }[],
  uploadedCategories: Set<string>
): boolean {
  for (const d of requiredDocs) {
    if (d.required && !uploadedCategories.has(d.key)) return false;
  }
  return true;
}

/** True if all document slots are optional (none marked required). */
export function allDocumentsOptional(
  requiredDocs: { key: string; required: boolean }[]
): boolean {
  if (requiredDocs.length === 0) return true;
  return requiredDocs.every((d) => !d.required);
}
