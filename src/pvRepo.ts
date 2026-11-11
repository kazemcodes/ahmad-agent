import type { Db } from './db.js';
import { queryAll, queryOne, runSql } from './db.js';
import { nowSec } from './logger.js';

export interface BaleStudentLink {
  user_id: number;
  national_code: string;
  student_id: number;
  full_name: string;
  teacher_name: string | null;
  school_name: string | null;
  class_name: string | null;
  linked_at: number;
  updated_at: number;
}

export interface PvState<T = Record<string, unknown>> {
  user_id: number;
  state: string;
  payload: T | null;
  updated_at: number;
}

export interface PvAttendanceLog {
  id: number;
  user_id: number;
  student_id: number;
  national_code: string;
  date: string;
  period_number: number;
  period_title: string | null;
  status: string;
  synced_at: number;
}

export class PvRepo {
  constructor(private db: Db) {}

  getLink(userId: number): BaleStudentLink | undefined {
    return queryOne<BaleStudentLink>(
      this.db,
      'SELECT user_id, national_code, student_id, full_name, teacher_name, school_name, class_name, linked_at, updated_at FROM bale_student_links WHERE user_id=?',
      userId,
    );
  }

  upsertLink(
    link: Omit<BaleStudentLink, 'linked_at' | 'updated_at'>,
    now = nowSec(),
  ): void {
    runSql(
      this.db,
      `INSERT INTO bale_student_links(user_id, national_code, student_id, full_name, teacher_name, school_name, class_name, linked_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         national_code=excluded.national_code,
         student_id=excluded.student_id,
         full_name=excluded.full_name,
         teacher_name=excluded.teacher_name,
         school_name=excluded.school_name,
         class_name=excluded.class_name,
         updated_at=excluded.updated_at`,
      link.user_id,
      link.national_code,
      link.student_id,
      link.full_name,
      link.teacher_name,
      link.school_name,
      link.class_name,
      now,
      now,
    );
  }

  deleteLink(userId: number): void {
    runSql(this.db, 'DELETE FROM bale_student_links WHERE user_id=?', userId);
  }

  getState<T = Record<string, unknown>>(userId: number): PvState<T> | undefined {
    const row = queryOne<{ user_id: number; state: string; payload: string | null; updated_at: number }>(
      this.db,
      'SELECT user_id, state, payload, updated_at FROM pv_states WHERE user_id=?',
      userId,
    );
    if (!row) return undefined;
    let parsed: T | null = null;
    if (row.payload) {
      try {
        parsed = JSON.parse(row.payload) as T;
      } catch {
        parsed = null;
      }
    }
    return {
      user_id: row.user_id,
      state: row.state,
      payload: parsed,
      updated_at: row.updated_at,
    };
  }

  setState(userId: number, state: string, payload?: unknown, now = nowSec()): void {
    const serialized = payload === undefined || payload === null ? null : JSON.stringify(payload);
    runSql(
      this.db,
      `INSERT INTO pv_states(user_id, state, payload, updated_at)
       VALUES(?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         state=excluded.state,
         payload=excluded.payload,
         updated_at=excluded.updated_at`,
      userId,
      state,
      serialized,
      now,
    );
  }

  clearState(userId: number): void {
    runSql(this.db, 'DELETE FROM pv_states WHERE user_id=?', userId);
  }

  upsertAttendanceLog(entry: Omit<PvAttendanceLog, 'id' | 'synced_at'>, now = nowSec()): void {
    runSql(
      this.db,
      `INSERT INTO pv_attendance_logs(user_id, student_id, national_code, date, period_number, period_title, status, synced_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, student_id, date, period_number) DO UPDATE SET
         national_code=excluded.national_code,
         period_title=excluded.period_title,
         status=excluded.status,
         synced_at=excluded.synced_at`,
      entry.user_id,
      entry.student_id,
      entry.national_code,
      entry.date,
      entry.period_number,
      entry.period_title,
      entry.status,
      now,
    );
  }

  listAttendanceLogs(userId: number, date?: string): PvAttendanceLog[] {
    if (date) {
      return queryAll<PvAttendanceLog>(
        this.db,
        'SELECT id, user_id, student_id, national_code, date, period_number, period_title, status, synced_at FROM pv_attendance_logs WHERE user_id=? AND date=? ORDER BY period_number',
        userId,
        date,
      );
    }
    return queryAll<PvAttendanceLog>(
      this.db,
      'SELECT id, user_id, student_id, national_code, date, period_number, period_title, status, synced_at FROM pv_attendance_logs WHERE user_id=? ORDER BY id DESC',
      userId,
    );
  }
}
