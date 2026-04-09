import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { resolveAuthBaseUrl } from "@kredit/shared";

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseUrl(
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3005"
  ),
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    passkeyClient(),
  ] as const,
});

const authClientUnsafe = authClient as any;
const AUTH_BASE_PATH = "/api/auth";

export interface RegisteredPasskey {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}

interface AuthUserSecurityFields {
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${AUTH_BASE_PATH}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!response.ok) {
    throw new Error(json.message || json.error || "Request failed");
  }
  return json;
}

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  changePassword,
  changeEmail,
  updateUser,
} = authClient;

export function signInWithPasskey() {
  return authClientUnsafe.signIn.passkey();
}

export function verifyTotp(args: { code: string; trustDevice?: boolean }) {
  return authClientUnsafe.twoFactor.verifyTotp(args);
}

export function verifyBackupCode(args: { code: string; trustDevice?: boolean }) {
  return authClientUnsafe.twoFactor.verifyBackupCode(args);
}

export function enableTwoFactor(args: { password: string }) {
  return authClientUnsafe.twoFactor.enable(args);
}

export function getTotpUri(args: { password: string }) {
  return authJson<{ totpURI: string }>("/two-factor/get-totp-uri", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function disableTwoFactor(args: { password: string }) {
  return authClientUnsafe.twoFactor.disable(args);
}

export function generateBackupCodes(args: { password: string }) {
  return authClientUnsafe.twoFactor.generateBackupCodes(args);
}

export function viewBackupCodes(args?: { userId?: string | null }) {
  return authClientUnsafe.twoFactor.viewBackupCodes(args);
}

export function addPasskey(args?: {
  name?: string;
  authenticatorAttachment?: "platform" | "cross-platform";
  useAutoRegister?: boolean;
}) {
  return authClientUnsafe.passkey.addPasskey(args);
}

export async function listUserPasskeys() {
  const rpId = new URL(
    process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  ).hostname;
  const res = await fetch(
    `/api/proxy/auth/passkeys?rpId=${encodeURIComponent(rpId)}`,
    { credentials: "include" }
  );
  const json = await res.json();
  if (!json.success) throw new Error("Failed to load passkeys");
  return json.data as RegisteredPasskey[];
}

export function updatePasskey(args: { id: string; name: string }) {
  return authJson<{ passkey: RegisteredPasskey }>("/passkey/update-passkey", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function deletePasskey(args: { id: string }) {
  return authJson<{ status: boolean }>("/passkey/delete-passkey", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

const skipSecuritySetupRedirect =
  process.env.NEXT_PUBLIC_SKIP_SECURITY_SETUP_REDIRECT === "true";

export async function fetchSecurityStatus(user: AuthUserSecurityFields | null | undefined) {
  const twoFactorEnabled = Boolean(user?.twoFactorEnabled);

  /** Local dev only: skip forcing passkey or TOTP before dashboard. Do not set in production. */
  if (skipSecuritySetupRedirect) {
    return {
      emailVerified: Boolean(user?.emailVerified),
      twoFactorEnabled,
      passkeys: [],
      hasPasskey: false,
      isSecuritySetupComplete: true,
    };
  }

  let passkeys: RegisteredPasskey[] = [];

  try {
    passkeys = await listUserPasskeys();
  } catch (error) {
    // If 2FA is already enabled in the local session, keep that stronger signal
    // instead of blocking dashboard access on a transient passkey lookup failure.
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

export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];
