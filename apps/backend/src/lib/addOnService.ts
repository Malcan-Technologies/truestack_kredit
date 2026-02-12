/**
 * Add-on validation service
 *
 * Checks whether a tenant has an active add-on AND a valid base subscription.
 * An add-on is considered valid only when:
 *   1. TenantAddOn.status === 'ACTIVE'
 *   2. Subscription.status is ACTIVE or GRACE_PERIOD
 */

import { prisma } from './prisma.js';

export type AddOnType = 'TRUESEND' | 'TRUEIDENTITY';

export class AddOnService {
  /**
   * Check if a tenant has an active add-on with a valid base subscription
   */
  static async hasActiveAddOn(tenantId: string, addOnType: AddOnType): Promise<boolean> {
    try {
      // Check add-on status
      const addOn = await prisma.tenantAddOn.findUnique({
        where: {
          tenantId_addOnType: { tenantId, addOnType },
        },
      });

      if (!addOn || addOn.status !== 'ACTIVE') {
        console.log(`[AddOnService] ${addOnType} check failed: addOn=${addOn ? addOn.status : 'NOT_FOUND'} for tenant ${tenantId}`);
        return false;
      }

      // Check base subscription is valid
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
      });

      if (!subscription) {
        console.log(`[AddOnService] ${addOnType} check failed: no subscription for tenant ${tenantId}`);
        return false;
      }

      const isValid = subscription.status === 'ACTIVE' || subscription.status === 'GRACE_PERIOD';
      if (!isValid) {
        console.log(`[AddOnService] ${addOnType} check failed: subscription status=${subscription.status} for tenant ${tenantId}`);
      }
      return isValid;
    } catch (error) {
      console.error(`[AddOnService] Error checking add-on ${addOnType} for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Get all active add-ons for a tenant
   */
  static async getActiveAddOns(tenantId: string): Promise<string[]> {
    try {
      const addOns = await prisma.tenantAddOn.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
        select: { addOnType: true },
      });

      // Also verify base subscription
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
      });

      if (!subscription || (subscription.status !== 'ACTIVE' && subscription.status !== 'GRACE_PERIOD')) {
        return [];
      }

      return addOns.map((a) => a.addOnType);
    } catch (error) {
      console.error(`[AddOnService] Error fetching add-ons for tenant ${tenantId}:`, error);
      return [];
    }
  }

  /**
   * Get all add-on records for a tenant (includes inactive)
   */
  static async getAllAddOns(tenantId: string) {
    return prisma.tenantAddOn.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
