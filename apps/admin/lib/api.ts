// Use proxy route for API calls to ensure cookies work correctly
// The proxy route forwards requests to the Express backend
const API_URL = "/api/proxy";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  emailSent?: boolean;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Make an authenticated API request using session cookies
 * Better Auth handles sessions via httpOnly cookies automatically
 * 
 * @param endpoint - The API endpoint (e.g., "/api/tenants/current" or "/tenants/current")
 *                   The "/api" prefix is optional and will be normalized
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Normalize endpoint - strip leading /api if present since proxy adds it
  const normalizedEndpoint = endpoint.startsWith("/api/") 
    ? endpoint.slice(4) // Remove "/api" prefix
    : endpoint;

  try {
    const response = await fetch(`${API_URL}${normalizedEndpoint}`, {
      ...options,
      headers,
      credentials: "include", // Include cookies for session auth
    });

    const data = await response.json();

    // Check for grace period header
    const gracePeriod = response.headers.get("X-Grace-Period");
    if (gracePeriod === "true") {
      const gracePeriodEnd = response.headers.get("X-Grace-Period-End");
      // Could emit an event or store in context to show warning
      console.warn("Subscription in grace period until:", gracePeriodEnd);
    }

    // Handle 401: redirect to login only when it's a real auth failure, not "no active tenant"
    if (response.status === 401) {
      const errorMessage = (data?.error ?? data?.message ?? "") as string;
      const isNoActiveTenant =
        errorMessage.includes("No active tenant") ||
        errorMessage.includes("Session not found");
      if (!isNoActiveTenant && typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return {
        success: false,
        error: data?.error ?? "Session expired. Please log in again.",
      };
    }

    return data;
  } catch (error) {
    console.error("API request failed:", error);
    return {
      success: false,
      error: "Network error. Please try again.",
    };
  }
}

export interface ApiPostOptions {
  headers?: Record<string, string>;
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string) => fetchApi<T>(endpoint, { method: "GET" }),

  post: <T>(endpoint: string, body: unknown, options?: ApiPostOptions) =>
    fetchApi<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      headers: options?.headers,
    }),

  patch: <T>(endpoint: string, body: unknown) =>
    fetchApi<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: <T>(endpoint: string) => fetchApi<T>(endpoint, { method: "DELETE" }),
};
