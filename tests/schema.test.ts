import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, initSchema } from '../src/db.ts';

// Fixture list: every SQL statement shape used across src/ (ahmad.ts, memory.ts,
// queues/*, classInstructions.ts, image/fallback.ts, dashboard/server.ts, cli).
// Prepared-run against a real initSchema() DB — a missing column/table throws here.
const STATEMENTS: Array<{ name: string; sql: string; params?: unknown[] }> = [
  { name: 'updates seen', sql: 'SELECT 1 AS x FROM updates WHERE id=?', params: [1] },
  { name: 'updates max', sql: 'SELECT COALESCE(MAX(id),-1)+1 AS o FROM updates' },
  { name: 'classes get', sql: 'SELECT start,end FROM classes WHERE chat=?', params: [1] },
  { name: 'classes upsert', sql: 'INSERT INTO classes(chat,start,end) VALUES(?,?,?) ON CONFLICT(chat) DO UPDATE SET start=excluded.start,end=excluded.end', params: [1, '08:00', '09:30'] },
  { name: 'roster by name', sql: 'SELECT * FROM roster WHERE chat=? AND name=?', params: [1, 'a'] },
  { name: 'roster by user', sql: 'SELECT 1 AS x FROM roster WHERE chat=? AND user_id=?', params: [1, 2] },
  { name: 'roster insert', sql: 'INSERT OR IGNORE INTO roster(chat,name) VALUES(?,?)', params: [1, 'a'] },
  { name: 'roster link', sql: 'UPDATE roster SET user_id=? WHERE id=?', params: [2, 1] },
  { name: 'roster rename', sql: 'UPDATE roster SET name=? WHERE chat=? AND name=?', params: ['b', 1, 'a'] },
  { name: 'messages insert', sql: 'INSERT INTO messages(chat,user_id,name,text,at) VALUES(?,?,?,?,?)', params: [1, 2, 'n', 't', 100] },
  { name: 'attendance insert', sql: 'INSERT OR IGNORE INTO attendance(chat,day,student,at) VALUES(?,?,?,?)', params: [1, '2026-01-01', 1, 100] },
  { name: 'session insert', sql: 'INSERT OR IGNORE INTO session_attendance(chat,day,schedule_id,student,at) VALUES(?,?,?,?,?)', params: [1, '2026-01-01', 1, 1, 100] },
  { name: 'reply insert', sql: 'INSERT OR IGNORE INTO reply_checkins(chat,day,user_id,name,at) VALUES(?,?,?,?,?)', params: [1, '2026-01-01', 2, 'n', 100] },
  { name: 'reply get', sql: 'SELECT name,at FROM reply_checkins WHERE chat=? AND day=? AND user_id=?', params: [1, '2026-01-01', 2] },
  { name: 'schedules has', sql: 'SELECT 1 AS x FROM schedules WHERE chat=? LIMIT 1', params: [1] },
  { name: 'schedules active', sql: 'SELECT 1 AS x FROM schedules WHERE chat=? AND weekday=? AND start<=? AND end>=? LIMIT 1', params: [1, 1, '08:00', '08:00'] },
  { name: 'schedules insert', sql: 'INSERT OR IGNORE INTO schedules(chat,weekday,start,end) VALUES(?,?,?,?)', params: [1, 1, '08:00', '09:30'] },
  { name: 'schedules list', sql: 'SELECT id,weekday,start,end FROM schedules WHERE chat=? ORDER BY weekday,start', params: [1] },
  { name: 'schedules delete', sql: 'DELETE FROM schedules WHERE chat=? AND id=?', params: [1, 1] },
  { name: 'corrections insert', sql: 'INSERT INTO corrections(chat,user_id,requested) VALUES(?,?,?)', params: [1, 2, 'n'] },
  { name: 'corrections pending', sql: "SELECT id,user_id,requested FROM corrections WHERE chat=? AND status='pending' ORDER BY id", params: [1] },
  { name: 'corrections approve', sql: "UPDATE corrections SET status='approved' WHERE id=?", params: [1] },
  { name: 'turns insert', sql: 'INSERT INTO conversation_turns(chat,user_id,role,content,at) VALUES(?,?,?,?,?)', params: [1, 2, 'user', 'x', 100] },
  { name: 'turns recent', sql: 'SELECT role,content FROM conversation_turns WHERE chat=? AND user_id=? ORDER BY id DESC LIMIT ?', params: [1, 2, 6] },
  { name: 'notes set', sql: 'INSERT INTO student_notes(chat,user_id,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat,user_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at', params: [1, 2, 'n', 100] },
  { name: 'notes get', sql: 'SELECT note FROM student_notes WHERE chat=? AND user_id=?', params: [1, 2] },
  { name: 'observed upsert', sql: 'INSERT INTO observed_users(chat,user_id,username,first_name,last_name,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(chat,user_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, last_seen=MAX(observed_users.last_seen,excluded.last_seen) WHERE excluded.last_seen>=observed_users.last_seen', params: [1, 2, null, null, null, 100, 100] },
  { name: 'instructions insert', sql: 'INSERT INTO class_instructions(chat,author,instruction,created_at) VALUES(?,?,?,?)', params: [1, 2, 'i', 100] },
  { name: 'instructions list', sql: 'SELECT id,instruction FROM class_instructions WHERE chat=? ORDER BY id DESC LIMIT 10', params: [1] },
  { name: 'queue insert', sql: 'INSERT OR IGNORE INTO request_queue(id,payload,created_at) VALUES(?,?,?)', params: [1, '{}', 100] },
  { name: 'queue claim', sql: "SELECT * FROM request_queue WHERE status='pending' AND available_at<=? ORDER BY id LIMIT 1", params: [100] },
  { name: 'limits insert', sql: 'INSERT INTO request_limits(scope,user_id,at) VALUES(?,?,?)', params: ['chat', 2, 100] },
  { name: 'limits count', sql: 'SELECT COUNT(*) AS n FROM request_limits WHERE scope=? AND user_id=? AND at>?', params: ['chat', 2, 0] },
  { name: 'image insert', sql: 'INSERT INTO image_jobs(update_id,chat,user_id,message_id,prompt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', params: [1, 1, 2, 3, 'p', 100, 100] },
  { name: 'image claim', sql: "SELECT * FROM image_jobs WHERE status='queued' AND available_at<=? ORDER BY id LIMIT 1", params: [100] },
  { name: 'provider state get', sql: 'SELECT blocked_until FROM image_provider_state WHERE provider=?', params: ['cloudflare:x'] },
  { name: 'dashboard messages', sql: 'SELECT m.name,m.text,m.at,m.chat,m.user_id,u.username FROM messages m LEFT JOIN observed_users u ON u.chat=m.chat AND u.user_id=m.user_id ORDER BY m.id DESC LIMIT 60' },
  { name: 'report join attendance', sql: 'SELECT r.name,a.at FROM roster r LEFT JOIN attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? WHERE r.chat=? ORDER BY r.name', params: ['2026-01-01', 1] },
  { name: 'report join session', sql: 'SELECT r.name,a.at FROM roster r LEFT JOIN session_attendance a ON a.student=r.id AND a.chat=r.chat AND a.day=? AND a.schedule_id=? WHERE r.chat=? ORDER BY r.name', params: ['2026-01-01', 1, 1] },
  { name: 'pv link upsert', sql: 'INSERT INTO bale_student_links(user_id,national_code,student_id,full_name,teacher_name,school_name,class_name,linked_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET national_code=excluded.national_code,student_id=excluded.student_id,full_name=excluded.full_name,teacher_name=excluded.teacher_name,school_name=excluded.school_name,class_name=excluded.class_name,updated_at=excluded.updated_at', params: [10, '0012345678', 1, 'Ali', 'Prof', 'High', '10A', 100, 100] },
  { name: 'pv link get', sql: 'SELECT * FROM bale_student_links WHERE user_id=?', params: [10] },
  { name: 'pv state upsert', sql: 'INSERT INTO pv_states(user_id,state,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,payload=excluded.payload,updated_at=excluded.updated_at', params: [10, 'menu', null, 100] },
  { name: 'pv state get', sql: 'SELECT user_id,state,payload,updated_at FROM pv_states WHERE user_id=?', params: [10] },
  { name: 'pv attendance upsert', sql: 'INSERT INTO pv_attendance_logs(user_id,student_id,national_code,date,period_number,period_title,status,synced_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,student_id,date,period_number) DO UPDATE SET period_title=excluded.period_title,status=excluded.status,synced_at=excluded.synced_at', params: [10, 1, '0012345678', '2026-10-12', 1, 'زنگ اول', 'present', 100] },
  { name: 'pv attendance list', sql: 'SELECT * FROM pv_attendance_logs WHERE user_id=? AND date=? ORDER BY period_number', params: [10, '2026-10-12'] },
];

test('every SQL statement prepares against initSchema()', () => {
  const db = initDb(':memory:');
  initSchema(db);
  for (const { name, sql, params } of STATEMENTS) {
    const stmt = db.prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(sql)) {
      stmt.all(...(params ?? []));
    } else {
      stmt.run(...(params ?? []));
    }
    void name;
  }
  db.close();
});

test('negative: SELECT id FROM classes must throw (bug-class regression)', () => {
  const db = initDb(':memory:');
  initSchema(db);
  assert.throws(() => db.prepare('SELECT id,start,end FROM classes WHERE chat=?'), /no such column: id/);
  db.close();
});

test('table columns pinned (PRAGMA table_info)', () => {
  const db = initDb(':memory:');
  initSchema(db);
  const cols = (t: string) =>
    (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((r) => r.name);
  assert.deepEqual(cols('classes'), ['chat', 'start', 'end']);
  assert.deepEqual(cols('attendance'), ['chat', 'day', 'student', 'at']);
  assert.deepEqual(cols('session_attendance'), ['chat', 'day', 'schedule_id', 'student', 'at']);
  assert.deepEqual(cols('roster'), ['id', 'chat', 'name', 'user_id']);
  assert.deepEqual(cols('bale_student_links'), ['user_id', 'national_code', 'student_id', 'full_name', 'teacher_name', 'school_name', 'class_name', 'linked_at', 'updated_at']);
  assert.deepEqual(cols('pv_states'), ['user_id', 'state', 'payload', 'updated_at']);
  assert.deepEqual(cols('pv_attendance_logs'), ['id', 'user_id', 'student_id', 'national_code', 'date', 'period_number', 'period_title', 'status', 'synced_at']);
  db.close();
});
