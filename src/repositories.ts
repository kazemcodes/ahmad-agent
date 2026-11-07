// Persistence-only layer. Use cases keep parsing/validation/Persian strings;
// these classes wrap exactly the SQL audited in tests/schema.test.ts.
import { queryOne, queryAll, runSql, type Db } from './db.js';

export type Row = Record<string, any>;

export class UpdatesRepo {
  constructor(private db: Db) {}
  /** Record that this user was flagged for spamming at `ts` (unix sec), banned until `ts + 30 minutes`. */
  banUser(chat: number, user: number, ts: number): void {
    runSql(
      this.db,
      `INSERT INTO spam_bans(chat,user_id,banned_at,until) VALUES(?,?,?,?)
       ON CONFLICT(chat,user_id) DO UPDATE SET banned_at=excluded.banned_at, until=excluded.until`,
      chat, user, ts, ts + 30 * 60,
    );
  }
  /** If this user is currently banned, return the `until` timestamp; else null. */
  bannedUntil(chat: number, user: number, now: number): number | null {
    const row = queryOne<{ until: number }>(
      this.db,
      'SELECT until FROM spam_bans WHERE chat=? AND user_id=? AND until > ?',
      chat, user, now,
    );
    return row ? Number(row.until) : null;
  }
  seen(id: number): boolean {
    return !!queryOne(this.db, 'SELECT 1 AS x FROM updates WHERE id=?', id);
  }
  markSeen(id: number): void {
    runSql(this.db, 'INSERT OR IGNORE INTO updates(id) VALUES(?)', id);
  }
  seenOffset(): number {
    const row = queryOne<{ o: number }>(this.db, 'SELECT COALESCE(MAX(id),-1)+1 AS o FROM updates');
    return Number(row?.o ?? 0);
  }
}

export class ClassesRepo {
  constructor(private db: Db) {}
  getDaily(chat: number): { start: string; end: string } | undefined {
    return queryOne(this.db, 'SELECT start,end FROM classes WHERE chat=?', chat);
  }
  upsertDaily(chat: number, start: string, end: string): void {
    runSql(
      this.db,
      'INSERT INTO classes(chat,start,end) VALUES(?,?,?) ON CONFLICT(chat) DO UPDATE SET start=excluded.start,end=excluded.end',
      chat,
      start,
      end,
    );
  }
  hasWeekly(chat: number): boolean {
    return !!queryOne(this.db, 'SELECT 1 AS x FROM schedules WHERE chat=? LIMIT 1', chat);
  }
  getActiveSchedule(chat: number, weekday: number, time: string): { id: number; start: string; end: string } | undefined {
    return queryOne(
      this.db,
      'SELECT id,start,end FROM schedules WHERE chat=? AND weekday=? AND start<=? AND end>=? ORDER BY start DESC LIMIT 1',
      chat,
      weekday,
      time,
      time,
    );
  }
  getActiveScheduleAnyDay(chat: number, weekday: number, time: string): { id: number; start: string; end: string } | undefined {
    return this.getActiveSchedule(chat, weekday, time);
  }
  listSchedules(chat: number): Row[] {
    return queryAll(this.db, 'SELECT id,weekday,start,end FROM schedules WHERE chat=? ORDER BY weekday,start', chat);
  }
  listTodayWindows(chat: number, weekday: number): Row[] {
    return queryAll(this.db, 'SELECT start,end FROM schedules WHERE chat=? AND weekday=? ORDER BY start', chat, weekday);
  }
  listTodayWithIds(chat: number, weekday: number): Row[] {
    return queryAll(this.db, 'SELECT id,start,end FROM schedules WHERE chat=? AND weekday=? ORDER BY start', chat, weekday);
  }
  addSchedule(chat: number, weekday: number, start: string, end: string): void {
    runSql(this.db, 'INSERT OR IGNORE INTO schedules(chat,weekday,start,end) VALUES(?,?,?,?)', chat, weekday, start, end);
  }
  deleteSchedule(chat: number, id: number): number {
    return runSql(this.db, 'DELETE FROM schedules WHERE chat=? AND id=?', chat, id).changes;
  }
  isScheduleActiveNow(chat: number, weekday: number, time: string): boolean {
    return !!queryOne(
      this.db,
      'SELECT 1 AS x FROM schedules WHERE chat=? AND weekday=? AND start<=? AND end>=? LIMIT 1',
      chat,
      weekday,
      time,
      time,
    );
  }
}

export class AttendanceRepo {
  constructor(private db: Db) {}
  addDaily(chat: number, day: string, student: number, at: number): void {
    runSql(this.db, 'INSERT OR IGNORE INTO attendance(chat,day,student,at) VALUES(?,?,?,?)', chat, day, student, at);
  }
  addSession(chat: number, day: string, scheduleId: number, student: number, at: number): void {
    runSql(
      this.db,
      'INSERT OR IGNORE INTO session_attendance(chat,day,schedule_id,student,at) VALUES(?,?,?,?,?)',
      chat,
      day,
      scheduleId,
      student,
      at,
    );
  }
  hasDaily(chat: number, day: string, student: number): boolean {
    return !!queryOne(this.db, 'SELECT 1 AS x FROM attendance WHERE chat=? AND day=? AND student=?', chat, day, student);
  }
  dailyRows(chat: number, day: string): Row[] {
    return queryAll(
      this.db,
      'SELECT r.name,a.at FROM roster r LEFT JOIN attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? WHERE r.chat=? ORDER BY r.name',
      day,
      chat,
    );
  }
  sessionRows(chat: number, day: string, scheduleId: number): Row[] {
    return queryAll(
      this.db,
      'SELECT r.name,a.at FROM roster r LEFT JOIN session_attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? AND a.schedule_id=? WHERE r.chat=? ORDER BY r.name',
      day,
      scheduleId,
      chat,
    );
  }
  replyExisting(chat: number, day: string, user: number): Row | undefined {
    return queryOne(this.db, 'SELECT name,at FROM reply_checkins WHERE chat=? AND day=? AND user_id=?', chat, day, user);
  }
  listReplyToday(chat: number, day: string): Row[] {
    return queryAll(
      this.db,
      `SELECT name,at,user_id,
              (SELECT COUNT(*) FROM messages m
               WHERE m.chat = r.chat AND m.user_id = r.user_id
                 AND date(m.at, 'unixepoch', 'localtime') = ?) AS msg_count
       FROM reply_checkins r
       WHERE chat=? AND day=? ORDER BY at,user_id`,
      day,
      chat,
      day,
    );
  }
  addReplyCheckin(chat: number, day: string, user: number, name: string, at: number): void {
    runSql(this.db, 'INSERT OR IGNORE INTO reply_checkins(chat,day,user_id,name,at) VALUES(?,?,?,?,?)', chat, day, user, name, at);
  }
  messageCountsInWindows(chat: number, windows: Array<{ start: string; end: string }>, day: string): Row[] {
    if (!windows.length) return [];
    const conditions: string[] = [];
    const params: unknown[] = [chat];
    for (const w of windows) {
      conditions.push('(at>=? AND at<?)');
      params.push(Date.parse(`${day} ${w.start}`) / 1000);
      params.push(Date.parse(`${day} ${w.end}`) / 1000 + 60);
    }
    return queryAll(this.db, `SELECT name,COUNT(*) n FROM messages WHERE chat=? AND (${conditions.join(' OR ')}) GROUP BY user_id ORDER BY n DESC`, ...params);
  }
}

export class CorrectionsRepo {
  constructor(private db: Db) {}
  add(chat: number, user: number, requested: string): void {
    runSql(this.db, 'INSERT INTO corrections(chat,user_id,requested) VALUES(?,?,?)', chat, user, requested);
  }
  listPending(chat: number): Row[] {
    return queryAll(this.db, "SELECT id,user_id,requested FROM corrections WHERE chat=? AND status='pending' ORDER BY id", chat);
  }
  getPending(id: number, chat: number): Row | undefined {
    return queryOne(this.db, "SELECT * FROM corrections WHERE id=? AND chat=? AND status='pending'", id, chat);
  }
  approve(id: number): void {
    runSql(this.db, "UPDATE corrections SET status='approved' WHERE id=?", id);
  }
}

export class MessagesRepo {
  constructor(private db: Db) {}
  add(chat: number, user: number, name: string, text: string, at: number): void {
    runSql(this.db, 'INSERT INTO messages(chat,user_id,name,text,at) VALUES(?,?,?,?,?)', chat, user, name, text, at);
  }
  updateEdited(chat: number, user: number, text: string): void {
    // NOTE: inherits the PHP bug — WHERE text=? binds the NEW text, so this
    // almost never matches. Kept for 1:1 parity; do not "fix" silently.
    runSql(this.db, 'UPDATE messages SET text=? WHERE chat=? AND user_id=? AND text=? ORDER BY id DESC LIMIT 1', text, chat, user, text);
  }
}

export interface Repositories {
  updates: UpdatesRepo;
  classes: ClassesRepo;
  attendance: AttendanceRepo;
  corrections: CorrectionsRepo;
  messages: MessagesRepo;
}

export function buildRepositories(db: Db): Repositories {
  return {
    updates: new UpdatesRepo(db),
    classes: new ClassesRepo(db),
    attendance: new AttendanceRepo(db),
    corrections: new CorrectionsRepo(db),
    messages: new MessagesRepo(db),
  };
}
