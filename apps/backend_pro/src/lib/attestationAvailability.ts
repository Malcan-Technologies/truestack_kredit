import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  ATTESTATION_TIMEZONE,
  DEFAULT_OFFICE_HOURS,
  MAX_AVAILABILITY_HORIZON_DAYS,
  type OfficeHoursConfig,
  SLOT_DURATION_MINUTES,
  SLOT_STEP_MINUTES,
} from './attestationConstants.js';
import { getCalendarFreeBusy, isGoogleMeetConfigured, type BusyInterval } from './googleMeetCalendar.js';
import { addMalaysiaDays, getMalaysiaStartOfDay } from './malaysiaTime.js';

export type AttestationSlot = { startAt: string; endAt: string };

function parseOfficeHoursJson(json: Prisma.JsonValue | null | undefined): OfficeHoursConfig {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return DEFAULT_OFFICE_HOURS;
  }
  const o = json as Record<string, unknown>;
  const weekdays = Array.isArray(o.weekdays)
    ? (o.weekdays as unknown[]).filter((x): x is number => typeof x === 'number')
    : DEFAULT_OFFICE_HOURS.weekdays;
  const start = typeof o.start === 'string' ? o.start : DEFAULT_OFFICE_HOURS.start;
  const end = typeof o.end === 'string' ? o.end : DEFAULT_OFFICE_HOURS.end;
  const slotStepMinutes =
    typeof o.slotStepMinutes === 'number' ? o.slotStepMinutes : SLOT_STEP_MINUTES;
  const slotDurationMinutes =
    typeof o.slotDurationMinutes === 'number' ? o.slotDurationMinutes : SLOT_DURATION_MINUTES;
  let horizon =
    typeof o.availabilityHorizonDays === 'number' ? o.availabilityHorizonDays : DEFAULT_OFFICE_HOURS.availabilityHorizonDays;
  horizon = Math.max(1, Math.min(MAX_AVAILABILITY_HORIZON_DAYS, Math.floor(horizon)));
  return {
    weekdays: weekdays.length ? weekdays : DEFAULT_OFFICE_HOURS.weekdays,
    start,
    end,
    slotStepMinutes,
    slotDurationMinutes,
    availabilityHorizonDays: horizon,
  };
}

/** ISO weekday: 1=Mon .. 7=Sun */
function getIsoWeekdayInMalaysia(d: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: ATTESTATION_TIMEZONE,
    weekday: 'short',
  }).format(d);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 1;
}

function parseHm(s: string): { h: number; m: number } {
  const [a, b] = s.split(':').map((x) => parseInt(x, 10));
  return { h: a || 0, m: b || 0 };
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isBlocked(slotStart: Date, slotEnd: Date, blocks: BusyInterval[]): boolean {
  for (const b of blocks) {
    if (intervalsOverlap(slotStart, slotEnd, b.start, b.end)) return true;
  }
  return false;
}

/**
 * Load tenant office hours (DB JSON or defaults).
 */
export async function getTenantOfficeHoursConfig(tenantId: string): Promise<OfficeHoursConfig> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { attestationOfficeHoursJson: true },
  });
  return parseOfficeHoursJson(t?.attestationOfficeHoursJson);
}

/**
 * Collect busy intervals from Google free/busy (if configured) plus DB holds and scheduled meetings.
 */
export async function collectBlockingIntervals(params: {
  tenantId: string;
  excludeLoanId?: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<{ busy: BusyInterval[]; usedGoogle: boolean }> {
  const busy: BusyInterval[] = [];
  let usedGoogle = false;

  if (isGoogleMeetConfigured()) {
    try {
      const fb = await getCalendarFreeBusy({ timeMin: params.timeMin, timeMax: params.timeMax });
      busy.push(...fb.busy);
      usedGoogle = true;
    } catch (e) {
      console.warn('[attestation] freeBusy failed, using DB-only blocks', e);
    }
  }

  const others = await prisma.loan.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.excludeLoanId ? { id: { not: params.excludeLoanId } } : {}),
      status: 'PENDING_DISBURSEMENT',
      OR: [
        {
          attestationStatus: { in: ['SLOT_PROPOSED', 'COUNTER_PROPOSED'] },
          attestationProposalStartAt: { not: null },
          attestationProposalEndAt: { not: null },
        },
        {
          attestationStatus: 'MEETING_SCHEDULED',
          attestationMeetingStartAt: { not: null },
          attestationMeetingEndAt: { not: null },
        },
      ],
    },
    select: {
      attestationStatus: true,
      attestationProposalStartAt: true,
      attestationProposalEndAt: true,
      attestationMeetingStartAt: true,
      attestationMeetingEndAt: true,
    },
  });

  for (const o of others) {
    if (
      o.attestationProposalStartAt &&
      o.attestationProposalEndAt &&
      (o.attestationStatus === 'SLOT_PROPOSED' || o.attestationStatus === 'COUNTER_PROPOSED')
    ) {
      busy.push({ start: o.attestationProposalStartAt, end: o.attestationProposalEndAt });
    } else if (
      o.attestationStatus === 'MEETING_SCHEDULED' &&
      o.attestationMeetingStartAt &&
      o.attestationMeetingEndAt
    ) {
      busy.push({ start: o.attestationMeetingStartAt, end: o.attestationMeetingEndAt });
    }
  }

  return { busy, usedGoogle };
}

/**
 * Build available ISO slot starts for borrower picker (30-min grid, 60-min duration).
 */
export async function listAvailableAttestationSlots(params: {
  tenantId: string;
  loanId: string;
}): Promise<{ slots: AttestationSlot[]; source: 'google_free_busy' | 'office_hours_fallback' }> {
  const config = await getTenantOfficeHoursConfig(params.tenantId);
  const horizonDays = config.availabilityHorizonDays;
  const now = new Date();
  const dayStart = getMalaysiaStartOfDay(now);
  const timeMin = addMinutes(now, 60); // buffer: don't book last minute
  const timeMax = addMalaysiaDays(dayStart, horizonDays);
  const timeMaxEnd = new Date(timeMax.getTime() + 24 * 60 * 60 * 1000);

  const { busy: rawBusy, usedGoogle } = await collectBlockingIntervals({
    tenantId: params.tenantId,
    excludeLoanId: params.loanId,
    timeMin,
    timeMax: timeMaxEnd,
  });

  const { h: openH, m: openM } = parseHm(config.start);
  const { h: closeH, m: closeM } = parseHm(config.end);
  const step = config.slotStepMinutes;
  const duration = config.slotDurationMinutes;

  const slots: AttestationSlot[] = [];

  for (let day = 0; day < horizonDays; day++) {
    const d = addMalaysiaDays(dayStart, day);
    const wd = getIsoWeekdayInMalaysia(d);
    if (!config.weekdays.includes(wd)) continue;

    const myMidnight = getMalaysiaStartOfDay(d);
    const openMs = (openH * 60 + openM) * 60 * 1000;
    const closeMs = (closeH * 60 + closeM) * 60 * 1000;
    const dayOpen = new Date(myMidnight.getTime() + openMs);
    const dayClose = new Date(myMidnight.getTime() + closeMs);

    for (
      let t = dayOpen.getTime();
      t + duration * 60 * 1000 <= dayClose.getTime();
      t += step * 60 * 1000
    ) {
      const slotStart = new Date(t);
      const slotEnd = addMinutes(slotStart, duration);
      if (slotEnd.getTime() <= timeMin.getTime()) continue;

      if (isBlocked(slotStart, slotEnd, rawBusy)) continue;

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
      });
    }
  }

  return {
    slots,
    source: usedGoogle ? 'google_free_busy' : 'office_hours_fallback',
  };
}
