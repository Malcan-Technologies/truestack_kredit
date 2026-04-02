export type SecuritySetupPreference = "passkey" | "authenticator" | "either";

export interface PendingTotpSetup {
  userId: string;
  totpURI: string;
}

const SECURITY_SETUP_PREFERENCE_COPY: Record<
  SecuritySetupPreference,
  { title: string; description: string }
> = {
  passkey: {
    title: "Passkey",
    description: "Use Touch ID, Face ID, Windows Hello, or a security key for faster sign-in.",
  },
  authenticator: {
    title: "Authenticator app",
    description: "Use Google Authenticator, 1Password, or another app to generate one-time codes.",
  },
  either: {
    title: "Decide after verification",
    description: "You can choose between passkey and authenticator setup after you sign in.",
  },
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function getStorage(): StorageLike | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  try {
    const storage = (globalThis as { sessionStorage?: StorageLike }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function makeKey(namespace: string, key: string) {
  return `auth-onboarding:${namespace}:${key}`;
}

export function getPendingVerificationEmail(namespace: string): string {
  const storage = getStorage();
  if (!storage) return "";

  return storage.getItem(makeKey(namespace, "pending-verification-email")) ?? "";
}

export function setPendingVerificationEmail(namespace: string, email: string) {
  const storage = getStorage();
  if (!storage) return;

  const value = email.trim();
  if (!value) {
    storage.removeItem(makeKey(namespace, "pending-verification-email"));
    return;
  }

  storage.setItem(makeKey(namespace, "pending-verification-email"), value);
}

export function clearPendingVerificationEmail(namespace: string) {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(makeKey(namespace, "pending-verification-email"));
}

export function getSecuritySetupPreference(
  namespace: string
): SecuritySetupPreference | null {
  const storage = getStorage();
  if (!storage) return null;

  const value = storage.getItem(makeKey(namespace, "security-setup-preference"));
  if (
    value === "passkey" ||
    value === "authenticator" ||
    value === "either"
  ) {
    return value;
  }

  return null;
}

export function setSecuritySetupPreference(
  namespace: string,
  preference: SecuritySetupPreference
) {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(makeKey(namespace, "security-setup-preference"), preference);
}

export function clearSecuritySetupPreference(namespace: string) {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(makeKey(namespace, "security-setup-preference"));
}

export function getSecuritySetupPreferenceCopy(
  preference: SecuritySetupPreference
) {
  return SECURITY_SETUP_PREFERENCE_COPY[preference];
}

export function getPendingTotpSetup(namespace: string): PendingTotpSetup | null {
  const storage = getStorage();
  if (!storage) return null;

  const value = storage.getItem(makeKey(namespace, "pending-totp-setup"));
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PendingTotpSetup>;
    if (
      typeof parsed.userId === "string" &&
      parsed.userId &&
      typeof parsed.totpURI === "string" &&
      parsed.totpURI
    ) {
      return {
        userId: parsed.userId,
        totpURI: parsed.totpURI,
      };
    }
  } catch {
    // Ignore invalid session storage content.
  }

  return null;
}

export function setPendingTotpSetup(
  namespace: string,
  pendingSetup: PendingTotpSetup
) {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(
    makeKey(namespace, "pending-totp-setup"),
    JSON.stringify(pendingSetup)
  );
}

export function clearPendingTotpSetup(namespace: string) {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(makeKey(namespace, "pending-totp-setup"));
}
