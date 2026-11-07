// Port of bin/student-data.php — export|delete BALE_USER_ID
import fs from 'node:fs';
import readline from 'node:readline';
import { config } from '../config.js';
import { initDb, initSchema } from '../db.js';

function hasTable(db: ReturnType<typeof initDb>, table: string): boolean {
  const row = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?").get(table) as
    | { x: number }
    | undefined;
  return !!row;
}

async function main(): Promise<void> {
  const [, , command, idRaw] = process.argv;
  if (!['export', 'delete'].includes(command ?? '') || !/^\d+$/.test(idRaw ?? '')) {
    console.error('Usage: npm run student-data -- export|delete BALE_USER_ID');
    process.exit(1);
  }
  if (!fs.existsSync(config.db)) {
    console.error('Database not found.');
    process.exit(1);
  }
  const db = initDb(config.db);
  initSchema(db);
  const id = Number(idRaw);

  if (command === 'export') {
    const result: Record<string, unknown> = {};
    for (const table of ['messages', 'conversation_turns', 'roster', 'corrections', 'observed_users', 'student_notes', 'reply_checkins']) {
      if (!hasTable(db, table)) continue;
      result[table] = db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(id);
    }
    result.attendance = db
      .prepare('SELECT a.* FROM attendance a JOIN roster r ON r.id=a.student WHERE r.user_id=?')
      .all(id);
    if (hasTable(db, 'session_attendance')) {
      result.session_attendance = db
        .prepare('SELECT a.* FROM session_attendance a JOIN roster r ON r.id=a.student WHERE r.user_id=?')
        .all(id);
    }
    console.log(JSON.stringify(result, null, 2));
    db.close();
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer: string = await new Promise((resolve) => {
    rl.question(
      `Deletion removes messages, conversation, corrections, attendance and roster entries for user ${id}. Type DELETE to continue: `,
      (a) => {
        rl.close();
        resolve(a.trim());
      },
    );
  });
  if (answer !== 'DELETE') {
    console.error('Cancelled.');
    process.exit(1);
  }
  const tx = db.transaction(() => {
    if (hasTable(db, 'session_attendance')) {
      db.prepare('DELETE FROM session_attendance WHERE student IN (SELECT id FROM roster WHERE user_id=?)').run(id);
    }
    db.prepare('DELETE FROM attendance WHERE student IN (SELECT id FROM roster WHERE user_id=?)').run(id);
    for (const table of ['messages', 'conversation_turns', 'corrections', 'roster', 'observed_users', 'student_notes', 'reply_checkins']) {
      if (hasTable(db, table)) {
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);
      }
    }
  });
  tx();
  console.error('Student data deleted. Backups and external provider data are not affected.');
  db.close();
}

void main();
