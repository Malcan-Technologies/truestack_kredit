const malaysiaTimeZone = 'Asia/Kuala_Lumpur';

function createDateFormatter() {
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: malaysiaTimeZone,
  });
}

function createDateTimeFormatter() {
  return new Intl.DateTimeFormat('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: malaysiaTimeZone,
  });
}

function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined) {
  const date = toDate(value);
  return date ? createDateFormatter().format(date) : '—';
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  return date ? createDateTimeFormatter().format(date) : '—';
}

function fallbackRelativeTime(value: number, unit: 'minute' | 'hour' | 'day') {
  const absolute = Math.abs(value);
  const suffix = absolute === 1 ? unit : `${unit}s`;

  if (value === 0) {
    return 'just now';
  }

  if (value > 0) {
    return `in ${absolute} ${suffix}`;
  }

  return `${absolute} ${suffix} ago`;
}

function formatRelative(value: number, unit: 'minute' | 'hour' | 'day') {
  if (typeof Intl?.RelativeTimeFormat === 'function') {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
  }

  return fallbackRelativeTime(value, unit);
}

export function formatRelativeTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) {
    return '—';
  }

  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);

  if (Math.abs(minutes) < 60) {
    return formatRelative(minutes, 'minute');
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatRelative(hours, 'hour');
  }

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) {
    return formatRelative(days, 'day');
  }

  return formatDateTime(date);
}
