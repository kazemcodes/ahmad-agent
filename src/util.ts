// Shared string/date helpers (moved out of ahmad.ts).
// All date formatting uses Asia/Tehran explicitly so the server's local TZ doesn't matter.
const TZ = 'Asia/Tehran';

const hhmmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });

export function substr(s: string, n: number): string {
  return [...s].slice(0, n).join('');
}

export function cpLen(s: string): number {
  return [...s].length;
}

export function norm(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** HH:MM in Asia/Tehran, e.g. "21:35". */
export function hhmm(ts: number): string {
  return hhmmFmt.format(new Date(ts * 1000));
}

/** YYYY-MM-DD in Asia/Tehran. */
export function ymd(ts: number): string {
  return ymdFmt.format(new Date(ts * 1000));
}

/** Day of week (0=Sunday … 6=Saturday) in Asia/Tehran. */
export function weekdayOf(ts: number): number {
  const name = weekdayFmt.format(new Date(ts * 1000));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}
