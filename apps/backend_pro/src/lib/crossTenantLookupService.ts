import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { toSafeNumber } from './math.js';

/** Consistency match levels for cross-tenant data comparison */
export type DataConsistencyLevel =
  | 'EXACT_MATCH'
  | 'ALMOST_FULL_MATCH'
  | 'PARTIAL_MATCH'
  | 'NOT_MATCHING'
  | 'NOT_AVAILABLE';

export type CrossTenantPerformanceRating =
  | 'NO_HISTORY'
  | 'GOOD'
  | 'WATCH'
  | 'HIGH_RISK'
  | 'DEFAULTED';

export const CROSS_TENANT_RECENT_LOANS_LIMIT = 5;

export type CrossTenantLookupQuery = {
  borrowerType: 'INDIVIDUAL' | 'CORPORATE';
  identifier: string;
  name?: string;
  phone?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

export type CrossTenantLookupResult = {
  hasHistory: boolean;
  otherLenderCount: number;
  lenderNames: string[];
  recentLoans: Array<{
    id: string;
    lenderName: string | null;
    loanAmountRange: string | null;
    status: string;
    paymentPerformance: { onTimeRateRange: string | null };
    agreementDate: string | null;
    disbursementDate: string | null;
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string | null;
  }>;
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  latePaymentsCount: number;
  totalBorrowedRange: string | null;
  paymentPerformance: {
    rating: CrossTenantPerformanceRating;
    onTimeRateRange: string | null;
  };
  lastBorrowedAt: string | null;
  lastActivityAt: string | null;
  nameConsistency: DataConsistencyLevel;
  phoneConsistency: DataConsistencyLevel;
  addressConsistency: DataConsistencyLevel;
};

export function normalizeIdentityNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Predefined buckets for total borrowed range (data privacy). */
const TOTAL_BORROWED_BUCKETS: Array<{ max: number; label: string }> = [
  { max: 10_000, label: 'Under RM 10,000' },
  { max: 50_000, label: 'RM 10,000 - RM 50,000' },
  { max: 100_000, label: 'RM 50,000 - RM 100,000' },
  { max: 500_000, label: 'RM 100,000 - RM 500,000' },
  { max: 1_000_000, label: 'RM 500,000 - RM 1,000,000' },
  { max: 10_000_000, label: 'RM 1,000,000 - RM 10,000,000' },
  { max: Infinity, label: 'RM 10,000,000+' },
];

export function getTotalBorrowedBucketLabel(amount: number): string {
  for (const [index, bucket] of TOTAL_BORROWED_BUCKETS.entries()) {
    if ((index === 0 && amount < bucket.max) || (index > 0 && amount <= bucket.max)) {
      return bucket.label;
    }
  }
  return TOTAL_BORROWED_BUCKETS[TOTAL_BORROWED_BUCKETS.length - 1].label;
}

const CROSS_TENANT_RISK_PRIORITY: Record<CrossTenantPerformanceRating, number> = {
  NO_HISTORY: 0,
  GOOD: 1,
  WATCH: 2,
  HIGH_RISK: 3,
  DEFAULTED: 4,
};

export function resolveCrossTenantRiskRating(
  riskLevels: Array<string | null | undefined>
): CrossTenantPerformanceRating {
  let resolved: CrossTenantPerformanceRating = 'NO_HISTORY';

  for (const level of riskLevels) {
    if (!level) continue;
    const normalized = level.toUpperCase();
    if (!(normalized in CROSS_TENANT_RISK_PRIORITY)) continue;

    const candidate = normalized as CrossTenantPerformanceRating;
    if (CROSS_TENANT_RISK_PRIORITY[candidate] > CROSS_TENANT_RISK_PRIORITY[resolved]) {
      resolved = candidate;
    }
  }

  return resolved;
}

export function toPercentageRange(value: number | null): string | null {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return null;

  const clamped = Math.max(0, Math.min(value, 100));
  const bucketIndex = clamped === 100 ? 9 : Math.floor(clamped / 10);
  const lower = bucketIndex * 10;
  const upper = lower + 10;
  return `${lower}-${upper}%`;
}

/** Common name particles to exclude when comparing names */
const NAME_PARTICLES = new Set(['bin', 'binti', 'binte', 'bt', 'ap']);

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getSignificantNameWords(s: string): string[] {
  return normalizeForCompare(s)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !NAME_PARTICLES.has(w));
}

export function computeNameConsistency(
  name1: string | null | undefined,
  name2: string | null | undefined
): DataConsistencyLevel {
  const a = name1?.trim() || '';
  const b = name2?.trim() || '';
  if (!a || !b) return 'NOT_AVAILABLE';

  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === nb) return 'EXACT_MATCH';
  if (na.length >= 2 && nb.includes(na)) return 'ALMOST_FULL_MATCH';
  if (nb.length >= 2 && na.includes(nb)) return 'ALMOST_FULL_MATCH';

  const wordsA = getSignificantNameWords(a);
  const wordsB = getSignificantNameWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 'NOT_AVAILABLE';

  const setB = new Set(wordsB);
  const matchCount = wordsA.filter(
    (w) => setB.has(w) || wordsB.some((bw) => w.startsWith(bw) || bw.startsWith(w))
  ).length;
  const firstA = wordsA[0]!;
  const firstB = wordsB[0]!;
  const firstNamesMatch = firstA === firstB || firstA.startsWith(firstB) || firstB.startsWith(firstA);

  if (!firstNamesMatch) return 'NOT_MATCHING';
  if (matchCount >= Math.min(wordsA.length, wordsB.length)) return 'ALMOST_FULL_MATCH';
  if (matchCount >= 1) return 'PARTIAL_MATCH';
  return 'NOT_MATCHING';
}

export function computePhoneConsistency(
  phone1: string | null | undefined,
  phone2: string | null | undefined
): DataConsistencyLevel {
  const p1 = phone1?.trim() || '';
  const p2 = phone2?.trim() || '';
  if (!p1 || !p2) return 'NOT_AVAILABLE';

  const d1 = p1.replace(/\D/g, '');
  const d2 = p2.replace(/\D/g, '');
  if (d1.length < 8 || d2.length < 8) return 'NOT_AVAILABLE';

  return d1 === d2 ? 'EXACT_MATCH' : 'NOT_MATCHING';
}

export function tokenizeAddress(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,#'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

export function buildAddressString(fields: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  address?: string | null;
  businessAddress?: string | null;
}): string {
  const parts: string[] = [];
  const line1 = fields.addressLine1 || fields.businessAddress || fields.address;
  if (line1) parts.push(line1);
  if (fields.addressLine2) parts.push(fields.addressLine2);
  if (fields.city) parts.push(fields.city);
  if (fields.state) parts.push(fields.state);
  if (fields.postcode) parts.push(fields.postcode);
  return parts.join(' ').trim();
}

export function computeAddressConsistency(
  addr1: string | null | undefined,
  addr2: string | null | undefined
): DataConsistencyLevel {
  const a = addr1?.trim() || '';
  const b = addr2?.trim() || '';
  if (!a || !b) return 'NOT_AVAILABLE';

  const tokensA = tokenizeAddress(a);
  const tokensB = tokenizeAddress(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 'NOT_AVAILABLE';

  const normalizedAddressA = tokensA.join(' ');
  const normalizedAddressB = tokensB.join(' ');
  if (normalizedAddressA === normalizedAddressB) return 'EXACT_MATCH';

  const setB = new Set(tokensB);
  const matching = tokensA.filter((t) =>
    setB.has(t) || tokensB.some((tb) => t === tb || t.startsWith(tb) || tb.startsWith(t))
  );
  const overlap = matching.length / Math.max(tokensA.length, tokensB.length, 1);

  if (overlap >= 0.9) return 'ALMOST_FULL_MATCH';
  if (overlap >= 0.4) return 'PARTIAL_MATCH';
  if (overlap >= 0.1) return 'PARTIAL_MATCH';
  return 'NOT_MATCHING';
}

export function aggregateConsistency(levels: DataConsistencyLevel[]): DataConsistencyLevel {
  const comparable = levels.filter((level) => level !== 'NOT_AVAILABLE');
  if (comparable.length === 0) return 'NOT_AVAILABLE';
  if (comparable.includes('NOT_MATCHING')) return 'NOT_MATCHING';
  if (comparable.includes('PARTIAL_MATCH')) return 'PARTIAL_MATCH';
  if (comparable.includes('ALMOST_FULL_MATCH')) return 'ALMOST_FULL_MATCH';
  return 'EXACT_MATCH';
}

function buildEmptyInsights(): CrossTenantLookupResult {
  return {
    hasHistory: false,
    otherLenderCount: 0,
    lenderNames: [],
    recentLoans: [],
    totalLoans: 0,
    activeLoans: 0,
    completedLoans: 0,
    defaultedLoans: 0,
    latePaymentsCount: 0,
    totalBorrowedRange: null,
    paymentPerformance: {
      rating: 'NO_HISTORY',
      onTimeRateRange: null,
    },
    lastBorrowedAt: null,
    lastActivityAt: null,
    nameConsistency: 'NOT_AVAILABLE',
    phoneConsistency: 'NOT_AVAILABLE',
    addressConsistency: 'NOT_AVAILABLE',
  };
}

export async function runCrossTenantLookup(
  tenantId: string,
  query: CrossTenantLookupQuery
): Promise<CrossTenantLookupResult> {
  const {
    borrowerType,
    identifier,
    name,
    phone,
    address,
    addressLine1,
    addressLine2,
    city,
    state,
    postcode,
  } = query;

  const isCorporate = borrowerType === 'CORPORATE';
  const rawMatchValue = identifier.trim();
  const matchValuesSet = new Set<string>();
  if (rawMatchValue.length > 0) {
    matchValuesSet.add(rawMatchValue);
  }

  if (!isCorporate) {
    const normalizedMatchValue = normalizeIdentityNumber(rawMatchValue);
    if (normalizedMatchValue.length > 0) {
      matchValuesSet.add(normalizedMatchValue);
    }
    if (normalizedMatchValue.length === 12 && /^\d{12}$/.test(normalizedMatchValue)) {
      matchValuesSet.add(
        `${normalizedMatchValue.slice(0, 6)}-${normalizedMatchValue.slice(6, 8)}-${normalizedMatchValue.slice(8)}`
      );
    }
  }
  const matchValues = Array.from(matchValuesSet);

  if (matchValues.length === 0) {
    return buildEmptyInsights();
  }

  const matchWhere: Prisma.BorrowerWhereInput = isCorporate
    ? {
        tenantId: { not: tenantId },
        borrowerType: 'CORPORATE',
        ssmRegistrationNo: { in: matchValues },
      }
    : {
        tenantId: { not: tenantId },
        borrowerType: 'INDIVIDUAL',
        icNumber: { in: matchValues },
      };

  const matchedBorrowers = await prisma.borrower.findMany({
    where: matchWhere,
    select: {
      id: true,
      name: true,
      phone: true,
      companyPhone: true,
      companyName: true,
      address: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postcode: true,
      businessAddress: true,
      performanceProjection: {
        select: {
          riskLevel: true,
          paidOnTimeCount: true,
          paidLateCount: true,
          overdueCount: true,
          lastPaymentAt: true,
        },
      },
    },
  });

  if (matchedBorrowers.length === 0) {
    return buildEmptyInsights();
  }

  const matchedBorrowerIds = matchedBorrowers.map((item) => item.id);
  const loanWhere = {
    borrowerId: { in: matchedBorrowerIds },
    tenantId: { not: tenantId },
    disbursementDate: { not: null },
    principalAmount: { gt: 0 },
  };

  const [loanAggregate, loanStatusGroups, loansByTenant, recentLoans] = await Promise.all([
    prisma.loan.aggregate({
      where: loanWhere,
      _max: { disbursementDate: true },
      _count: { id: true },
    }),
    prisma.loan.groupBy({
      by: ['status'],
      where: loanWhere,
      _count: { _all: true },
    }),
    prisma.loan.groupBy({
      by: ['tenantId'],
      where: loanWhere,
      _sum: { principalAmount: true },
    }),
    prisma.loan.findMany({
      where: loanWhere,
      orderBy: [
        { disbursementDate: 'desc' },
        { agreementDate: 'desc' },
        { createdAt: 'desc' },
      ],
      take: CROSS_TENANT_RECENT_LOANS_LIMIT,
      select: {
        id: true,
        tenantId: true,
        principalAmount: true,
        repaymentRate: true,
        status: true,
        agreementDate: true,
        disbursementDate: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const totalLoans = loanAggregate._count.id ?? 0;
  if (totalLoans === 0) {
    return buildEmptyInsights();
  }

  const statusCounts = loanStatusGroups.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});

  const activeLoans = (statusCounts.ACTIVE ?? 0) + (statusCounts.IN_ARREARS ?? 0);
  const completedLoans = statusCounts.COMPLETED ?? 0;
  const defaultedLoans = (statusCounts.DEFAULTED ?? 0) + (statusCounts.WRITTEN_OFF ?? 0);

  const projectionAggregate = matchedBorrowers.reduce(
    (acc, item) => {
      const projection = item.performanceProjection;
      if (!projection) return acc;

      acc.paidOnTime += projection.paidOnTimeCount;
      acc.paidLate += projection.paidLateCount;
      acc.overdue += projection.overdueCount;
      acc.riskLevels.push(projection.riskLevel);
      if (!acc.lastPaymentAt || (projection.lastPaymentAt && projection.lastPaymentAt > acc.lastPaymentAt)) {
        acc.lastPaymentAt = projection.lastPaymentAt;
      }
      return acc;
    },
    {
      paidOnTime: 0,
      paidLate: 0,
      overdue: 0,
      riskLevels: [] as Array<string | null>,
      lastPaymentAt: null as Date | null,
    }
  );

  const projectionSampleSize =
    projectionAggregate.paidOnTime + projectionAggregate.paidLate + projectionAggregate.overdue;
  const onTimeRate =
    projectionSampleSize > 0 ? (projectionAggregate.paidOnTime / projectionSampleSize) * 100 : null;
  let rating = resolveCrossTenantRiskRating(projectionAggregate.riskLevels);
  if (rating === 'NO_HISTORY' && defaultedLoans > 0) {
    rating = 'DEFAULTED';
  }

  const totalBorrowedPerLender = loansByTenant
    .map((row) => toSafeNumber(row._sum.principalAmount))
    .filter((v) => v > 0);
  const totalBorrowedRange =
    totalBorrowedPerLender.length > 0
      ? (() => {
          const minVal = Math.min(...totalBorrowedPerLender);
          const maxVal = Math.max(...totalBorrowedPerLender);
          const minLabel = getTotalBorrowedBucketLabel(minVal);
          const maxLabel = getTotalBorrowedBucketLabel(maxVal);
          return minLabel === maxLabel ? minLabel : `${minLabel} to ${maxLabel}`;
        })()
      : null;

  const lenders = await prisma.tenant.findMany({
    where: { id: { in: loansByTenant.map((row) => row.tenantId) } },
    select: { id: true, name: true },
  });
  const lenderNameById = new Map(lenders.map((l) => [l.id, l.name]));
  const lenderNames = loansByTenant
    .map((row) => lenderNameById.get(row.tenantId))
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => a.localeCompare(b));

  const recentLoanLastPaymentRows =
    recentLoans.length > 0
      ? await prisma.paymentTransaction.groupBy({
          by: ['loanId'],
          where: {
            tenantId: { not: tenantId },
            loanId: { in: recentLoans.map((loan) => loan.id) },
          },
          _max: { paymentDate: true },
        })
      : [];
  const recentLoanLastPaymentByLoanId = new Map(
    recentLoanLastPaymentRows.map((row) => [row.loanId, row._max.paymentDate ?? null])
  );

  const recentLoanDetails = recentLoans.map((loan) => ({
    id: loan.id,
    lenderName: lenderNameById.get(loan.tenantId) ?? null,
    loanAmountRange: getTotalBorrowedBucketLabel(toSafeNumber(loan.principalAmount)),
    status: loan.status,
    paymentPerformance: {
      onTimeRateRange: toPercentageRange(
        loan.repaymentRate === null ? null : toSafeNumber(loan.repaymentRate)
      ),
    },
    agreementDate: loan.agreementDate?.toISOString() ?? null,
    disbursementDate: loan.disbursementDate?.toISOString() ?? null,
    createdAt: loan.createdAt.toISOString(),
    updatedAt: loan.updatedAt.toISOString(),
    lastActivityAt: recentLoanLastPaymentByLoanId.get(loan.id)?.toISOString() ?? null,
  }));

  const currentDisplayName = name?.trim() || '';
  const currentPhone = phone?.trim() || '';
  const currentAddress = buildAddressString({
    address,
    addressLine1,
    addressLine2,
    city,
    state,
    postcode,
  });
  const nameConsistency = aggregateConsistency(
    matchedBorrowers.map((m) => {
      const matchedName = borrowerType === 'CORPORATE' ? (m.companyName || m.name) || '' : (m.name || '');
      return computeNameConsistency(currentDisplayName, matchedName);
    })
  );
  const phoneConsistency = aggregateConsistency(
    matchedBorrowers.map((m) => {
      const matchedPhone = borrowerType === 'CORPORATE' ? (m.companyPhone || m.phone) : m.phone;
      return computePhoneConsistency(currentPhone, matchedPhone);
    })
  );
  const addressConsistency = aggregateConsistency(
    matchedBorrowers.map((m) => computeAddressConsistency(currentAddress, buildAddressString(m)))
  );

  return {
    hasHistory: true,
    otherLenderCount: loansByTenant.length,
    lenderNames,
    recentLoans: recentLoanDetails,
    totalLoans,
    activeLoans,
    completedLoans,
    defaultedLoans,
    latePaymentsCount: projectionAggregate.paidLate,
    totalBorrowedRange,
    paymentPerformance: {
      rating,
      onTimeRateRange: toPercentageRange(onTimeRate),
    },
    lastBorrowedAt: loanAggregate._max.disbursementDate?.toISOString() ?? null,
    lastActivityAt: projectionAggregate.lastPaymentAt?.toISOString() ?? null,
    nameConsistency,
    phoneConsistency,
    addressConsistency,
  };
}
