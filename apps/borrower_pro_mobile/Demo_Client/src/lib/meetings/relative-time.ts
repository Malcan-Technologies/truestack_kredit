/** Relative label for a meeting or proposal time (mirrors web `formatRelativeMeetingLabel`). */
export function formatRelativeMeetingLabel(iso: string | null, now: Date): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diffSec);
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
