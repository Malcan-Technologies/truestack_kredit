import Cookies from "js-cookie";

const ACCESS_TOKEN_KEY = "kredit_access_token";
const REFRESH_TOKEN_KEY = "kredit_refresh_token";
const USER_KEY = "kredit_user";
const TENANT_KEY = "kredit_tenant";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "STAFF";
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status?: string;
}

/**
 * Token storage utilities
 */
export const TokenStorage = {
  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  setAccessToken(token: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    Cookies.set(ACCESS_TOKEN_KEY, token, { expires: 1 }); // 1 day
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    Cookies.set(REFRESH_TOKEN_KEY, token, { expires: 7 }); // 7 days
  },

  getUser(): User | null {
    if (typeof window === "undefined") return null;
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  },

  setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getTenant(): Tenant | null {
    if (typeof window === "undefined") return null;
    const data = localStorage.getItem(TENANT_KEY);
    return data ? JSON.parse(data) : null;
  },

  setTenant(tenant: Tenant): void {
    localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
  },

  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TENANT_KEY);
    Cookies.remove(ACCESS_TOKEN_KEY);
    Cookies.remove(REFRESH_TOKEN_KEY);
  },

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },
};

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = TokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }
    );

    if (!response.ok) {
      TokenStorage.clear();
      return false;
    }

    const data = await response.json();
    TokenStorage.setAccessToken(data.data.accessToken);
    TokenStorage.setRefreshToken(data.data.refreshToken);
    return true;
  } catch {
    TokenStorage.clear();
    return false;
  }
}

/**
 * Check authentication and get current user
 */
export async function checkAuth(): Promise<{ user: User; tenant: Tenant } | null> {
  const token = TokenStorage.getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (response.status === 401) {
      // Try to refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return checkAuth();
      }
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    TokenStorage.setUser(data.data.user);
    TokenStorage.setTenant(data.data.tenant);
    return data.data;
  } catch {
    return null;
  }
}

/**
 * Logout
 */
export function logout(): void {
  TokenStorage.clear();
  window.location.href = "/login";
}
