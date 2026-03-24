/**
 * Create Google Calendar events with Google Meet links (service account).
 * Configure: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID
 * Optional: GOOGLE_CALENDAR_IMPERSONATE_USER (domain-wide delegation subject).
 */
import { JWT } from 'google-auth-library';

export type CreateMeetEventResult = {
  eventId: string;
  meetLink: string;
  htmlLink: string;
  startAt: Date;
  endAt: Date;
};

export function isGoogleMeetConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

export async function createGoogleMeetEvent(params: {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendeeEmail?: string;
}): Promise<CreateMeetEventResult> {
  if (!isGoogleMeetConfigured()) {
    throw new Error(
      'Google Calendar/Meet is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_CALENDAR_ID.'
    );
  }

  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    subject: process.env.GOOGLE_CALENDAR_IMPERSONATE_USER || undefined,
  });

  const { token } = await jwt.getAccessToken();
  if (!token || typeof token !== 'string') {
    throw new Error('Failed to obtain Google access token');
  }

  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);
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

  if (params.attendeeEmail) {
    body.attendees = [{ email: params.attendeeEmail }];
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
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
    throw new Error(`Google Calendar API error: ${res.status} ${text}`);
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
