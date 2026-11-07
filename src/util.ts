// Shared string/date helpers (moved out of ahmad.ts).
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

export function hhmm(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ymd(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekdayOf(ts: number): number {
  return new Date(ts * 1000).getDay();
}
