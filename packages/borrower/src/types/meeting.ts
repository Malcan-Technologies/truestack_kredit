import type { AttestationStatus } from "./loan";

/** Response row from GET /api/borrower-auth/meetings */
export interface BorrowerMeetingSummary {
  loanId: string;
  loanStatus: string;
  tenantName: string;
  productName: string;
  principalAmount: string;
  term: number;
  attestationStatus: AttestationStatus;
  proposalStartAt: string | null;
  proposalEndAt: string | null;
  proposalDeadlineAt: string | null;
  proposalSource: "BORROWER" | "ADMIN_COUNTER" | null;
  meetingStartAt: string | null;
  meetingEndAt: string | null;
  meetingLink: string | null;
  meetingNotes: string | null;
  meetingSource: "google" | "manual";
  attestationMeetingAdminCompletedAt: string | null;
  attestationCompletedAt: string | null;
  actionNeeded: boolean;
  sortAt: string;
  uiTab: "upcoming" | "action" | "past";
}
