import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        memberId: string;
        email: string;
        name: string | null;
        role: UserRole | string;
      };
      tenantId?: string;
      memberId?: string;
    }
  }
}

// Mark as module
export {};
