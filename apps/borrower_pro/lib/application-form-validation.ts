import type { BorrowerProduct } from "@kredit/borrower";

export function termValidationError(product: BorrowerProduct, term: number): string | null {
  if (term < product.minTerm || term > product.maxTerm) {
    return `Term must be ${product.minTerm}–${product.maxTerm} months`;
  }
  const allowed = product.allowedTerms?.filter((n) => typeof n === "number") ?? [];
  if (allowed.length > 0) {
    if (!allowed.includes(term)) {
      const sorted = [...new Set(allowed)].sort((a, b) => a - b);
      return `Term must be one of: ${sorted.join(", ")} months`;
    }
    return null;
  }
  const interval = product.termInterval && product.termInterval > 0 ? product.termInterval : 1;
  if ((term - product.minTerm) % interval !== 0) {
    return `Term must increase in steps of ${interval} month(s) from ${product.minTerm}`;
  }
  return null;
}

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
  else {
    const te = termValidationError(params.product, term);
    if (te) errors.term = te;
  }

  if (params.product.loanScheduleType === "JADUAL_K") {
    if (!params.collateralType.trim()) errors.collateralType = "Collateral type is required";
    const cv = params.collateralValue === "" ? 0 : params.collateralValue;
    if (cv <= 0) errors.collateralValue = "Collateral value is required";
  }

  return errors;
}

export function isLoanDetailsStepComplete(params: {
  product: BorrowerProduct;
  amount: number | "";
  term: number | "";
  collateralType: string;
  collateralValue: number | "";
}): boolean {
  return Object.keys(validateLoanDetailsStep(params)).length === 0;
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
