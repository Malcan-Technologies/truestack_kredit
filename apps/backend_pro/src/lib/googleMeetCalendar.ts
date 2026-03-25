/**
 * Google Calendar: free/busy, create events with Meet, delete events (service account).
 * Configure: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID
 * Optional: GOOGLE_CALENDAR_IMPERSONATE_USER (domain-wide delegation subject = tenant mailbox).
 */
import { JWT } from 'google-auth-library';

export type CreateMeetEventResult = {
  eventId: string;
  meetLink: string;
  htmlLink: string;
  startAt: Date;
  endAt: Date;
};

export type BusyInterval = { start: Date; end: Date };

function googleAuthErrorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const g = err as Error & { response?: { data?: unknown } };
  let text = g.message;
  const data = g.response?.data;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.error_description === 'string') text += ` ${o.error_description}`;
    if (typeof o.error === 'string') text += ` ${o.error}`;
  }
  return text;
}

async function getAccessToken(): Promise<string> {
  if (!isGoogleMeetConfigured()) {
    throw new Error(
      'Google Calendar/Meet is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_CALENDAR_ID.'
    );
  }

  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  if (!saEmail.endsWith('.iam.gserviceaccount.com')) {
    throw new Error(
      'Google Calendar auth failed: GOOGLE_SERVICE_ACCOUNT_EMAIL must be your Google Cloud service account ' +
        '(ends with .iam.gserviceaccount.com). Create one in IAM → Service accounts, add a JSON key, and paste that email — not a personal Gmail.'
    );
  }

  const impersonate = process.env.GOOGLE_CALENDAR_IMPERSONATE_USER?.trim();
  if (impersonate && /@gmail\.com$/i.test(impersonate)) {
    throw new Error(
      'Google Calendar auth failed: GOOGLE_CALENDAR_IMPERSONATE_USER cannot be a consumer @gmail.com address. ' +
        'Remove this line from .env and set GOOGLE_CALENDAR_ID to the service account email (or a calendar shared with it). ' +
        'Impersonation only works for Google Workspace users with domain-wide delegation.'
    );
  }

  const jwt = new JWT({
    email: saEmail,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ],
    subject: impersonate || undefined,
  });

  try {
    const { token } = await jwt.getAccessToken();
    if (!token || typeof token !== 'string') {
      throw new Error('Failed to obtain Google access token');
    }
    return token;
  } catch (err) {
    const raw = googleAuthErrorText(err);
    const lower = raw.toLowerCase();
    if (lower.includes('invalid_grant') && lower.includes('account not found')) {
      throw new Error(
        'Google Calendar auth failed (invalid_grant / account not found). ' +
          'Typical causes: (1) GOOGLE_SERVICE_ACCOUNT_EMAIL must be the service account from Google Cloud ' +
          '(name@project-id.iam.gserviceaccount.com), not Gmail. ' +
          '(2) If GOOGLE_CALENDAR_IMPERSONATE_USER is set, it must be a Workspace user with domain-wide delegation — not @gmail.com. ' +
          'For local dev: remove GOOGLE_CALENDAR_IMPERSONATE_USER; set GOOGLE_CALENDAR_ID to the service account email. ' +
          `Original: ${raw}`
      );
    }
    throw err;
  }
}

export function isGoogleMeetConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

function calendarIdEncoded(): string {
  return encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
}

/** Turn Calendar REST failures into short messages; includes enable link when API is disabled. */
function calendarApiError(status: number, bodyText: string): Error {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: {
        message?: string;
        details?: Array<{ reason?: string; metadata?: Record<string, string> }>;
      };
    };
    const apiMsg = parsed?.error?.message ?? '';
    const lower = apiMsg.toLowerCase();
    if (
      status === 403 &&
      (lower.includes('has not been used') ||
        lower.includes('is disabled') ||
        lower.includes('accessnotconfigured'))
    ) {
      let activationUrl: string | undefined;
      for (const d of parsed?.error?.details ?? []) {
        const md = d?.metadata;
        if (md?.activationUrl) {
          activationUrl = md.activationUrl;
          break;
        }
      }
      return new Error(
        'Google Calendar: Enable "Google Calendar API" for the Google Cloud project that owns your service account ' +
          '(APIs & Services → Library → Google Calendar API → Enable). Wait 1–2 minutes, then retry. ' +
          (activationUrl ? `Open: ${activationUrl}` : '')
      );
    }
  } catch {
    /* body not JSON */
  }
  return new Error(`Google Calendar API error: ${status} ${bodyText}`);
}

/**
 * Query free/busy for the configured calendar (tenant mailbox when using impersonation).
 */
export async function getCalendarFreeBusy(params: {
  timeMin: Date;
  timeMax: Date;
}): Promise<{ busy: BusyInterval[]; calendarsError?: unknown }> {
  const token = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: params.timeMin.toISOString(),
      timeMax: params.timeMax.toISOString(),
      timeZone: 'Asia/Kuala_Lumpur',
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw calendarApiError(res.status, text);
  }

  const data = (await res.json()) as {
    calendars?: Record<
      string,
      { busy?: Array<{ start?: string; end?: string }>; errors?: unknown[] }
    >;
  };

  const cal = data.calendars?.[calendarId];
  const busyRaw = cal?.busy ?? [];
  const busy: BusyInterval[] = [];
  for (const b of busyRaw) {
    if (b.start && b.end) {
      busy.push({ start: new Date(b.start), end: new Date(b.end) });
    }
  }

  return { busy, calendarsError: cal?.errors };
}

export async function createGoogleMeetEvent(params: {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendeeEmail?: string;
}): Promise<CreateMeetEventResult> {
  const token = await getAccessToken();

  const requestId = `meet-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

  const body: Record<string, unknown> = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.startAt.toISOString(), timeZone: 'Asia/Kuala_Lumpur' },
    end: { dateTime: params.endAt.toISOString(), timeZone: 'Asia/Kuala_Lumpur' },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Service accounts cannot set attendees unless using domain-wide delegation (subject = Workspace user).
  // Without delegation, Calendar returns 403 forbiddenForServiceAccounts. Borrower still gets the Meet link via app email.
  const impersonateUser = process.env.GOOGLE_CALENDAR_IMPERSONATE_USER?.trim();
  if (params.attendeeEmail && impersonateUser) {
    body.attendees = [{ email: params.attendeeEmail }];
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarIdEncoded()}/events?conferenceDataVersion=1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw calendarApiError(res.status, text);
  }

  const event = (await res.json()) as {
    id: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };

  const meetLink =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    '';

  if (!meetLink) {
    throw new Error('Calendar event created but no Meet link was returned');
  }

  return {
    eventId: event.id,
    meetLink,
    htmlLink: event.htmlLink || '',
    startAt: params.startAt,
    endAt: params.endAt,
  };
}

/**
 * Delete a calendar event (e.g. after loan cancel or before replacing hold with real meeting).
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();
  const eid = encodeURIComponent(eventId);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarIdEncoded()}/events/${eid}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw calendarApiError(res.status, text);
  }
}
