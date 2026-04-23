/**
 * Shared borrower security (2FA / passkey) completion check for web portals.
 * Callers must inject `listPasskeys` (Better Auth + app proxy), since this package has no network layer.
 */

export interface BorrowerSecurityStatus {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  passkeys: Array<{
    id: string;
    name?: string;
    deviceType?: string;
    backedUp?: boolean;
    createdAt?: string;
  }>;
  hasPasskey: boolean;
  isSecuritySetupComplete: boolean;
}

type SecurityUser = {
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
} | null | undefined;

/**
 * @param skipSecuritySetupRedirect — set `true` when `NEXT_PUBLIC_SKIP_SECURITY_SETUP_REDIRECT` in dev; treats setup as complete.
 */
export async function resolveBorrowerSecurityStatus(params: {
  user: SecurityUser;
  skipSecuritySetupRedirect: boolean;
  listPasskeys: () => Promise<
    Array<{ id: string; name?: string; deviceType?: string; backedUp?: boolean; createdAt?: string }>
  >;
}): Promise<BorrowerSecurityStatus> {
  const { user, skipSecuritySetupRedirect, listPasskeys } = params;
  const twoFactorEnabled = Boolean(user?.twoFactorEnabled);

  if (skipSecuritySetupRedirect) {
    return {
      emailVerified: Boolean(user?.emailVerified),
      twoFactorEnabled,
      passkeys: [],
      hasPasskey: false,
      isSecuritySetupComplete: true,
    };
  }

  let passkeys: BorrowerSecurityStatus["passkeys"] = [];

  try {
    passkeys = await listPasskeys();
  } catch (error) {
    if (!twoFactorEnabled) {
      throw error;
    }
  }

  return {
    emailVerified: Boolean(user?.emailVerified),
    twoFactorEnabled,
    passkeys,
    hasPasskey: passkeys.length > 0,
    isSecuritySetupComplete: twoFactorEnabled || passkeys.length > 0,
  };
}
