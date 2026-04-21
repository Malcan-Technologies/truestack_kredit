import { getStoredItem, removeStoredItem, setStoredItem } from '@/lib/storage/app-storage';
import type { BorrowerProduct, LoanPreviewData } from '@kredit/borrower';

export const LOAN_WIZARD_DRAFT_KEY = 'loan_application_draft';

export interface LoanWizardDraft {
  applicationId?: string;
  productId?: string;
  amount: string;
  term: string;
  collateralType: string;
  collateralValue: string;
  step: number;
  profileSubStep: number;
}

export const initialLoanWizardDraft: LoanWizardDraft = {
  applicationId: undefined,
  productId: undefined,
  amount: '',
  term: '',
  collateralType: '',
  collateralValue: '',
  step: 0,
  profileSubStep: 1,
};

export async function loadLoanWizardDraft(): Promise<LoanWizardDraft | null> {
  const raw = await getStoredItem(LOAN_WIZARD_DRAFT_KEY);
  if (!raw) return null;
  try {
    return { ...initialLoanWizardDraft, ...(JSON.parse(raw) as Partial<LoanWizardDraft>) };
  } catch {
    return null;
  }
}

export async function saveLoanWizardDraft(draft: LoanWizardDraft): Promise<void> {
  await setStoredItem(LOAN_WIZARD_DRAFT_KEY, JSON.stringify(draft));
}

export async function clearLoanWizardDraft(): Promise<void> {
  await removeStoredItem(LOAN_WIZARD_DRAFT_KEY);
}

export function validateLoanDetails(
  amount: string,
  term: string,
  product: BorrowerProduct,
  collateralType: string,
  collateralValue: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const amt = parseFloat(amount);
  const trm = parseInt(term, 10);
  const minAmt = parseFloat(String(product.minAmount));
  const maxAmt = parseFloat(String(product.maxAmount));

  if (!amount.trim() || isNaN(amt) || amt <= 0) {
    errors.amount = 'Loan amount is required';
  } else if (!isNaN(minAmt) && amt < minAmt) {
    errors.amount = `Minimum amount is RM ${minAmt.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  } else if (!isNaN(maxAmt) && amt > maxAmt) {
    errors.amount = `Maximum amount is RM ${maxAmt.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  }

  if (!term || isNaN(trm) || trm <= 0) {
    errors.term = 'Loan term is required';
  } else if (trm < product.minTerm) {
    errors.term = `Minimum term is ${product.minTerm} months`;
  } else if (trm > product.maxTerm) {
    errors.term = `Maximum term is ${product.maxTerm} months`;
  } else {
    const allowed = (product.allowedTerms ?? []).filter((n) => typeof n === 'number');
    if (allowed.length > 0) {
      if (!allowed.includes(trm)) {
        const sorted = [...new Set(allowed)].sort((a, b) => a - b);
        errors.term = `Term must be one of: ${sorted.join(', ')} months`;
      }
    } else {
      const interval = product.termInterval && product.termInterval > 0 ? product.termInterval : 1;
      if ((trm - product.minTerm) % interval !== 0) {
        errors.term = `Term must increase in steps of ${interval} month(s) from ${product.minTerm}`;
      }
    }
  }

  if (product.loanScheduleType === 'JADUAL_K') {
    if (!collateralType.trim()) errors.collateralType = 'Collateral type is required';
    const cv = parseFloat(collateralValue);
    if (!collateralValue.trim() || isNaN(cv) || cv <= 0) {
      errors.collateralValue = 'Collateral value is required';
    }
  }

  return errors;
}

export function isLoanAmountAndTermComplete(
  amount: string,
  term: string,
  product: BorrowerProduct,
): boolean {
  const errors = validateLoanDetails(amount, term, product, '', '');
  return !errors.amount && !errors.term;
}

export function isCollateralSectionComplete(
  product: BorrowerProduct,
  collateralType: string,
  collateralValue: string,
): boolean {
  if (product.loanScheduleType !== 'JADUAL_K') return true;
  if (!collateralType.trim()) return false;
  const cv = parseFloat(collateralValue);
  return !!collateralValue.trim() && !isNaN(cv) && cv > 0;
}

export function formatCurrencyRM(value: unknown): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return 'RM —';
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildTermOptions(product: BorrowerProduct): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  for (let t = product.minTerm; t <= product.maxTerm; t++) {
    options.push({ label: `${t} months`, value: String(t) });
  }
  return options;
}

export function formatPreviewFeeLabel(feeType: string, value: unknown): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return '—';
  if (feeType === 'PERCENTAGE') return `${n}%`;
  return formatCurrencyRM(value);
}

// Re-export type so consumers can import LoanPreviewData from this module path if desired
export type { LoanPreviewData };
