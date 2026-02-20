import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/authenticate.js';

const router = Router();

// Profile-level: works without active tenant (user may have no tenants yet)
router.use(requireSession);

/**
 * GET /api/referrals
 * List referrals for current user (as referrer)
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;

    const referrals = await prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: {
          select: { email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate stats
    const total = referrals.length;
    const eligible = referrals.filter((r) => r.isEligible).length;
    const paid = referrals.filter((r) => r.isPaid).length;
    const unpaid = referrals.filter((r) => r.isEligible && !r.isPaid).length;
    const totalRewards = referrals.reduce((sum, r) => sum + r.rewardAmount, 0);
    const paidRewards = referrals
      .filter((r) => r.isPaid)
      .reduce((sum, r) => sum + r.rewardAmount, 0);

    res.json({
      success: true,
      data: {
        total,
        eligible,
        paid,
        unpaid,
        totalRewards,
        paidRewards,
        referrals: referrals.map((r) => ({
          id: r.id,
          referredUserEmail: r.referredUser.email,
          referredUserName: r.referredUser.name,
          referralCode: r.referralCode,
          rewardAmount: r.rewardAmount,
          isEligible: r.isEligible,
          isPaid: r.isPaid,
          eligibleAt: r.eligibleAt.toISOString(),
          paidAt: r.paidAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referrals/:id/mark-paid
 * Mark a referral as paid (manual payout tracking)
 */
router.post('/:id/mark-paid', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const referralId = req.params.id;

    // Find the referral
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundError('Referral not found');
    }

    // Only the referrer can mark their own referrals as paid
    if (referral.referrerUserId !== userId) {
      throw new ForbiddenError('You can only mark your own referrals as paid');
    }

    // Only allowed if eligible
    if (!referral.isEligible) {
      throw new BadRequestError('Referral is not eligible for payout');
    }

    // Already paid?
    if (referral.isPaid) {
      throw new BadRequestError('Referral is already marked as paid');
    }

    // Update referral
    const updated = await prisma.referral.update({
      where: { id: referralId },
      data: {
        isPaid: true,
        paidAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        isPaid: updated.isPaid,
        paidAt: updated.paidAt!.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
