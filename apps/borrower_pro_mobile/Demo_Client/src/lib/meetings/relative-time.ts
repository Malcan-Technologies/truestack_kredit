function hasRelativeTimeFormat(): boolean {
  if (typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat !== 'function') {
    return false;
  }
  try {
    void new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return true;
  } catch {
    return false;
  }
}

/** Plain English fallback when `Intl.RelativeTimeFormat` is missing (common on RN/Hermes). */
function formatRelativeFallback(diffSec: number): string {
  const abs = Math.abs(diffSec);
  const past = diffSec < 0;
  const ago = (s: string) => (past ? `${s} ago` : `in ${s}`);
  if (abs < 60) return ago(abs === 1 ? '1 second' : `${abs} seconds`);
  const min = Math.round(diffSec / 60);
  const absMin = Math.abs(min);
  if (abs < 3600) return ago(absMin === 1 ? '1 minute' : `${absMin} minutes`);
  const hr = Math.round(diffSec / 3600);
  const absHr = Math.abs(hr);
  if (abs < 86400) return ago(absHr === 1 ? '1 hour' : `${absHr} hours`);
  const day = Math.round(diffSec / 86400);
  const absDay = Math.abs(day);
  return ago(absDay === 1 ? '1 day' : `${absDay} days`);
}

/** Relative label for a meeting or proposal time (mirrors web `formatRelativeMeetingLabel`). */
export function formatRelativeMeetingLabel(iso: string | null, now: Date): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);

  if (!hasRelativeTimeFormat()) {
    return formatRelativeFallback(diffSec);
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur';

export function formatMeetingRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return '—';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: MALAYSIA_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  const a = new Date(startIso).toLocaleString('en-MY', opts);
  if (!endIso) return a;
  const b = new Date(endIso).toLocaleTimeString('en-MY', {
    timeZone: MALAYSIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${a} — ${b}`;
}
