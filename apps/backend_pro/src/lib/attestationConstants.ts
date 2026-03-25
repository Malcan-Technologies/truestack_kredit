/** Malaysia single-TZ for attestation booking */
export const ATTESTATION_TIMEZONE = 'Asia/Kuala_Lumpur';

export const PROPOSAL_DEADLINE_MS = 12 * 60 * 60 * 1000;
export const MAX_BORROWER_ATTESTATION_PROPOSALS = 5;
export const SLOT_STEP_MINUTES = 30;
export const SLOT_DURATION_MINUTES = 60;
/** How far ahead to offer slots */
export const AVAILABILITY_HORIZON_DAYS = 14;

export type OfficeHoursConfig = {
  weekdays: number[]; // 1=Mon .. 7=Sun (ISO weekday)
  start: string; // "09:00"
  end: string; // "17:00"
  slotStepMinutes: number;
  slotDurationMinutes: number;
};

export const DEFAULT_OFFICE_HOURS: OfficeHoursConfig = {
  weekdays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
  slotStepMinutes: SLOT_STEP_MINUTES,
  slotDurationMinutes: SLOT_DURATION_MINUTES,
};
