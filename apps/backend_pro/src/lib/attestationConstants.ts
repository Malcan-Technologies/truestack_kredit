/** Malaysia single-TZ for attestation booking */
export const ATTESTATION_TIMEZONE = 'Asia/Kuala_Lumpur';

/** Borrower may propose a slot at most once per pending round (reset when proposal expires) */
export const MAX_BORROWER_ATTESTATION_PROPOSALS = 1;
export const SLOT_STEP_MINUTES = 30;
export const SLOT_DURATION_MINUTES = 60;
/** Default horizon when tenant JSON omits it (admin can set 1–7 in office hours JSON) */
export const DEFAULT_AVAILABILITY_HORIZON_DAYS = 7;
/** Hard cap for configurable horizon (days of slot availability) */
export const MAX_AVAILABILITY_HORIZON_DAYS = 7;

export type OfficeHoursConfig = {
  weekdays: number[]; // 1=Mon .. 7=Sun (ISO weekday)
  start: string; // "09:00"
  end: string; // "17:00"
  slotStepMinutes: number;
  slotDurationMinutes: number;
  /** How many calendar days ahead to offer slots (1–7), default 7 */
  availabilityHorizonDays: number;
};

export const DEFAULT_OFFICE_HOURS: OfficeHoursConfig = {
  weekdays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
  slotStepMinutes: SLOT_STEP_MINUTES,
  slotDurationMinutes: SLOT_DURATION_MINUTES,
  availabilityHorizonDays: DEFAULT_AVAILABILITY_HORIZON_DAYS,
};
