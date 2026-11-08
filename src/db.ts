// Single better-sqlite3 connection + initSchema().
// CREATE TABLE/INDEX statements are copied verbatim from the PHP sources so
// an existing data/ahmad.sqlite works unchanged (no migration needed).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = ReturnType<typeof Database>;

export function reopenDb(dbPath: string): Db {
  return initDb(dbPath);
}

export function initDb(dbPath: string): Db {
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  return db;
}

/** Small SQL helpers — repos and use cases use these instead of raw prepare(). */
export function queryOne<T = any>(db: Db, sql: string, ...args: unknown[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}

export function queryAll<T = any>(db: Db, sql: string, ...args: unknown[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}

export function runSql(
  db: Db,
  sql: string,
  ...args: unknown[]
): { changes: number; lastInsertRowid: number | bigint } {
  return db.prepare(sql).run(...args);
}

export function initSchema(db: Db): void {
  // From Ahmad.php
  db.exec(`
    CREATE TABLE IF NOT EXISTS updates(id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS classes(chat INTEGER PRIMARY KEY, start TEXT, end TEXT);
    CREATE TABLE IF NOT EXISTS roster(id INTEGER PRIMARY KEY, chat INTEGER, name TEXT, user_id INTEGER, UNIQUE(chat,name));
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, chat INTEGER, user_id INTEGER, name TEXT, text TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS attendance(chat INTEGER, day TEXT, student INTEGER, at INTEGER, PRIMARY KEY(chat,day,student));
    CREATE TABLE IF NOT EXISTS session_attendance(chat INTEGER NOT NULL, day TEXT NOT NULL, schedule_id INTEGER NOT NULL, student INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(chat,day,schedule_id,student));
    CREATE TABLE IF NOT EXISTS reply_checkins(chat INTEGER NOT NULL, day TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(chat,day,user_id,at));
    CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY, chat INTEGER NOT NULL, weekday INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, UNIQUE(chat,weekday,start,end));
    CREATE TABLE IF NOT EXISTS corrections(id INTEGER PRIMARY KEY, chat INTEGER, user_id INTEGER, requested TEXT, status TEXT DEFAULT 'pending');
  `);
  // From Memory.php
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_turns (id INTEGER PRIMARY KEY, chat INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS conversation_scope ON conversation_turns(chat,user_id,id);
    CREATE INDEX IF NOT EXISTS messages_scope ON messages(chat,user_id,at);
    CREATE TABLE IF NOT EXISTS student_notes (chat INTEGER NOT NULL, user_id INTEGER NOT NULL, note TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(chat,user_id));
    CREATE TABLE IF NOT EXISTS observed_users (chat INTEGER NOT NULL, user_id INTEGER NOT NULL, username TEXT, first_name TEXT, last_name TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(chat,user_id));
  `);
  // From ClassInstructions.php
  db.exec(
    'CREATE TABLE IF NOT EXISTS class_instructions (id INTEGER PRIMARY KEY AUTOINCREMENT, chat INTEGER NOT NULL, author INTEGER NOT NULL, instruction TEXT NOT NULL, created_at INTEGER NOT NULL)',
  );
  // From RequestQueue.php
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_queue (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, error TEXT);
    CREATE INDEX IF NOT EXISTS request_queue_ready ON request_queue(status,available_at,id);
    CREATE TABLE IF NOT EXISTS request_limits (scope TEXT NOT NULL, user_id INTEGER NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS request_limits_lookup ON request_limits(scope,user_id,at);
  `);
  // From ImageQueue.php
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_jobs (
      id INTEGER PRIMARY KEY,
      update_id INTEGER UNIQUE,
      chat INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message_id INTEGER,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      updated_at INTEGER NOT NULL,
      error TEXT);
    CREATE INDEX IF NOT EXISTS image_jobs_ready ON image_jobs(status,available_at,id);
    CREATE INDEX IF NOT EXISTS image_jobs_user ON image_jobs(chat,user_id,status,created_at);
  `);
  // From ImageFallback.php
  db.exec(
    'CREATE TABLE IF NOT EXISTS image_provider_state (provider TEXT PRIMARY KEY, blocked_until INTEGER NOT NULL)',
  );
  // Spam bans — one row per (chat, user), `until` is a unix timestamp.
  db.exec(
    'CREATE TABLE IF NOT EXISTS spam_bans (chat INTEGER NOT NULL, user_id INTEGER NOT NULL, banned_at INTEGER NOT NULL, until INTEGER NOT NULL, PRIMARY KEY(chat,user_id))',
  );
  // Chat titles — cached from incoming messages (Bale sends chat.title for groups).
  db.exec(
    'CREATE TABLE IF NOT EXISTS chat_titles (chat INTEGER PRIMARY KEY, title TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  );

  // Migration: reply_checkins PK changed from (chat,day,user_id) to
  // (chat,day,user_id,at) to allow multiple check-ins per day (one per session).
  // Detect old schema by checking the SQL definition.
  {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reply_checkins'")
      .get() as { sql: string } | undefined;
    if (row && !row.sql.includes('at)')) {
      // Old PK — migrate safely.
      db.exec(`
        CREATE TABLE IF NOT EXISTS reply_checkins_new(
          chat INTEGER NOT NULL, day TEXT NOT NULL, user_id INTEGER NOT NULL,
          name TEXT NOT NULL, at INTEGER NOT NULL,
          PRIMARY KEY(chat,day,user_id,at)
        );
        INSERT OR IGNORE INTO reply_checkins_new SELECT * FROM reply_checkins;
        DROP TABLE reply_checkins;
        ALTER TABLE reply_checkins_new RENAME TO reply_checkins;
      `);
    }
  }
}
