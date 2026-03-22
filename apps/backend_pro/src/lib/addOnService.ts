/**
 * TrueKredit Pro: all product modules are included for licensed tenants (no per-module SaaS add-on rows).
 */

import { prisma } from './prisma.js';

export type AddOnType = 'TRUESEND' | 'TRUEIDENTITY' | 'BORROWER_PERFORMANCE';

const BORROWER_PERFORMANCE_FEATURE_ENABLED =
  (process.env.BORROWER_PERFORMANCE_FEATURE_ENABLED ?? 'true').toLowerCase() !== 'false';

async function tenantIsLicensed(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  return !!t && t.status === 'ACTIVE';
}

export class AddOnService {
  static async hasActiveAddOn(tenantId: string, addOnType: AddOnType): Promise<boolean> {
    if (!(await tenantIsLicensed(tenantId))) {
      return false;
    }
    if (addOnType === 'BORROWER_PERFORMANCE' && !BORROWER_PERFORMANCE_FEATURE_ENABLED) {
      return false;
    }
    return true;
  }

  static async getActiveAddOns(tenantId: string): Promise<string[]> {
    if (!(await tenantIsLicensed(tenantId))) {
      return [];
    }
    const out: string[] = ['TRUESEND', 'TRUEIDENTITY'];
    if (BORROWER_PERFORMANCE_FEATURE_ENABLED) {
      out.push('BORROWER_PERFORMANCE');
    }
    return out;
  }

  static async getAllAddOns(_tenantId: string) {
    return [] as const;
  }
}
