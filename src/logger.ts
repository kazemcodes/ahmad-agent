// Port of Ahmad::log() — `[ahmad] <ISO-8601 with tz offset> <event> <json>`
// to stdout, and append to data/bot.log (dashboard reads its tail).
import fs from 'node:fs';
import path from 'node:path';

export class Logger {
  private logFile: string | null = null;

  constructor(
    private tz: string,
    logPath?: string,
  ) {
    if (logPath) {
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        this.logFile = logPath;
      } catch {
        this.logFile = null;
      }
    }
  }

  isoNow(): string {
    // Cheap: use Intl to get offset-ish ISO with configured tz.
    const d = new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: this.tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'longOffset',
      }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const base = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
      const tz = get('timeZoneName').replace('GMT', '');
      return base + (tz || '+00:00');
    } catch {
      return d.toISOString();
    }
  }

  log(event: string, context: Record<string, unknown> = {}): void {
    const line = `[ahmad] ${this.isoNow()} ${event} ${JSON.stringify(context)}`;
    console.log(line);
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line + '\n');
      } catch {
        /* ignore */
      }
    }
  }

  error(event: string, err: unknown): void {
    this.log(event, { error: err instanceof Error ? err.message : String(err) });
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
