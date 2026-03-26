import type { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth.js';
import { getBetterAuthHeaders, getSessionTokenFromCookie } from '../lib/authCookies.js';
import { prisma } from '../lib/prisma.js';
import { UnauthorizedError } from '../lib/errors.js';

async function resolveCurrentSession(userId: string, cookieHeader: string | undefined) {
  const sessionToken = getSessionTokenFromCookie(cookieHeader);
  if (sessionToken) {
    const byToken = await prisma.session.findFirst({
      where: {
        token: sessionToken,
        userId,
        expiresAt: { gt: new Date() },
      },
    });
    if (byToken) return byToken;
  }

  return prisma.session.findFirst({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export interface BorrowerSessionUser {
  userId: string;
  email: string;
  name: string | null;
  tenantId?: string;
  activeBorrowerId?: string | null;
  sessionToken?: string | null;
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      borrowerUser?: BorrowerSessionUser;
    }
  }
}

/**
 * Authenticate borrower user via Better Auth session.
 * Does NOT require tenant membership - used for borrower_pro self-service.
 */
export async function requireBorrowerSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: getBetterAuthHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new UnauthorizedError('Invalid or expired session');
    }

    const dbSession = await resolveCurrentSession(session.user.id, req.headers.cookie);
    const sessionToken = getSessionTokenFromCookie(req.headers.cookie);

    if (!dbSession) {
      throw new UnauthorizedError('Session not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    req.borrowerUser = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      activeBorrowerId: dbSession.activeBorrowerId,
      sessionToken: sessionToken ?? undefined,
      sessionId: dbSession.id,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      console.error('[BorrowerAuth] Session verification error:', error);
      next(new UnauthorizedError('Invalid or expired session'));
    }
  }
}
