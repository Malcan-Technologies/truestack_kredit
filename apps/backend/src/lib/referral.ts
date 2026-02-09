import { prisma } from './prisma.js';

/**
 * Characters used for referral code generation
 * Excludes ambiguous characters: 0, O, I, 1, L
 * Uppercase alphanumeric only
 */
const REFERRAL_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a unique referral code
 * - Format: exactly 6 uppercase alphanumeric characters
 * - Excludes ambiguous characters (0, O, I, 1, L)
 * - Uniqueness enforced by DB + retry on collision
 */
function generateReferralCode(): string {
  const length = 6;
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * REFERRAL_CHARS.length);
    code += REFERRAL_CHARS[randomIndex];
  }
  return code;
}

/**
 * Get or create referral code for a user
 * - If exists: return it
 * - If not: generate, save, return
 * - Handles collision retry (max 5 attempts)
 * 
 * @param userId - User ID to get/create referral code for
 * @returns Referral code string
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  // First, check if user already has a referral code
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (user?.referralCode) {
    return user.referralCode;
  }

  // Generate a new referral code with collision handling
  const maxAttempts = 5;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const code = generateReferralCode();

    try {
      // Try to update user with new referral code
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });

      return updated.referralCode!;
    } catch (error: any) {
      // If unique constraint violation, try again
      if (error?.code === 'P2002' && error?.meta?.target?.includes('referralCode')) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error('Failed to generate unique referral code after multiple attempts');
        }
        continue;
      }
      // Other errors should be thrown
      throw error;
    }
  }

  throw new Error('Failed to generate referral code');
}
