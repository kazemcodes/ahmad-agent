// Port of src/Memory.php
import type { Db } from './db.js';
import { nowSec } from './logger.js';
import type { BaleUser } from './types.js';

const STOP = new Set([
  'آقای', 'ناظر', 'چیه', 'چیست', 'چطور', 'چگونه', 'برای', 'لطفا', 'بگو', 'میشه', 'سلام', 'کنم', 'کردم', 'بود',
  'the', 'what', 'that', 'this',
]);

export interface SearchRow {
  name: string;
  text: string;
  at: number;
}

export class Memory {
  constructor(private db: Db) {}

  observeUser(chat: number, user: BaleUser, at: number): void {
    this.db
      .prepare(
        `INSERT INTO observed_users(chat,user_id,username,first_name,last_name,first_seen,last_seen)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(chat,user_id) DO UPDATE SET
           username=excluded.username,
           first_name=excluded.first_name,
           last_name=excluded.last_name,
           last_seen=MAX(observed_users.last_seen,excluded.last_seen)
         WHERE excluded.last_seen>=observed_users.last_seen`,
      )
      .run(chat, Number(user.id), user.username ?? null, user.first_name ?? null, user.last_name ?? null, at, at);
  }

  setNote(chat: number, user: number, note: string): void {
    this.db
      .prepare('INSERT INTO student_notes(chat,user_id,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat,user_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at')
      .run(chat, user, note, nowSec());
  }

  note(chat: number, user: number): string {
    const row = this.db.prepare('SELECT note FROM student_notes WHERE chat=? AND user_id=?').get(chat, user) as
      | { note: string }
      | undefined;
    return row?.note ?? '';
  }

  deleteNote(chat: number, user: number): void {
    this.db.prepare('DELETE FROM student_notes WHERE chat=? AND user_id=?').run(chat, user);
  }

  remember(chat: number, user: number, role: string, content: string): void {
    this.db
      .prepare('INSERT INTO conversation_turns(chat,user_id,role,content,at) VALUES(?,?,?,?,?)')
      .run(chat, user, role, content, nowSec());
  }

  recent(chat: number, user: number, limit = 12): Array<{ role: string; content: string }> {
    const rows = this.db
      .prepare('SELECT role,content FROM conversation_turns WHERE chat=? AND user_id=? ORDER BY id DESC LIMIT ?')
      .all(chat, user, limit) as Array<{ role: string; content: string }>;
    return rows.reverse();
  }

  relevant(chat: number, user: number, query: string, limit = 4): string[] {
    const rawTerms = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const terms = [...new Set(rawTerms.filter((w) => [...w].length >= 3 && !STOP.has(w)))].slice(0, 8);
    if (terms.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT id,content FROM conversation_turns
         WHERE chat=? AND user_id=? AND role='user'
         AND id NOT IN (SELECT id FROM conversation_turns WHERE chat=? AND user_id=? ORDER BY id DESC LIMIT 12)
         ORDER BY id DESC LIMIT 500`,
      )
      .all(chat, user, chat, user) as Array<{ id: number; content: string }>;
    const matches: Array<{ score: number; id: number; content: string }> = [];
    for (const row of rows) {
      const text = row.content.toLowerCase();
      let score = 0;
      for (const t of terms) if (text.includes(t)) score++;
      if (score > 0) {
        matches.push({ score, id: row.id, content: [...row.content].slice(0, 500).join('') });
      }
    }
    matches.sort((a, b) => b.score - a.score || b.id - a.id);
    return matches.slice(0, Math.max(0, Math.min(limit, 4))).map((m) => m.content);
  }

  search(chat: number, user: number | null, term: string, limit = 10): SearchRow[] {
    const esc = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    let sql = "SELECT name,text,at FROM messages WHERE chat=? AND text LIKE ? ESCAPE '\\'";
    const args: unknown[] = [chat, `%${esc}%`];
    if (user !== null) {
      sql += ' AND user_id=?';
      args.push(user);
    }
    sql += ` ORDER BY at DESC LIMIT ${Math.max(1, Math.min(20, limit))}`;
    return this.db.prepare(sql).all(...args) as SearchRow[];
  }

  forget(chat: number, user: number): void {
    this.db.prepare('DELETE FROM conversation_turns WHERE chat=? AND user_id=?').run(chat, user);
  }
}
