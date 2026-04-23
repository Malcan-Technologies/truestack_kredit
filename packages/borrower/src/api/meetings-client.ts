import type { BorrowerMeetingSummary } from "../types/meeting";
import type { FetchFn } from "./shared";
import { parseJson } from "./shared";

export function createMeetingsApiClient(baseUrl: string, fetchFn: FetchFn) {
  async function listBorrowerMeetings(params?: { includePast?: boolean }): Promise<{
    success: boolean;
    data: BorrowerMeetingSummary[];
  }> {
    const q = new URLSearchParams();
    if (params?.includePast) q.set("include", "past");
    const qs = q.toString();
    const res = await fetchFn(`${baseUrl}/meetings${qs ? `?${qs}` : ""}`);
    const json = await parseJson<{
      success: boolean;
      data?: BorrowerMeetingSummary[];
      error?: string;
    }>(res);
    if (!res.ok) {
      throw new Error(json.error || "Failed to list meetings");
    }
    return { success: true, data: json.data ?? [] };
  }

  return { listBorrowerMeetings };
}
