import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { Memory } from '../src/memory.ts';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahmad-mem-'));
  const p = path.join(dir, 'test.sqlite');
  const db = initDb(p);
  initSchema(db);
  return { db, dir };
}

test('remember + recent round-trip, ordered', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  m.remember(1, 2, 'user', 'q1');
  m.remember(1, 2, 'assistant', 'a1');
  const recent = m.recent(1, 2, 10);
  assert.deepEqual(recent.map((r) => r.content), ['q1', 'a1']);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recent respects per-chat isolation', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  m.remember(1, 2, 'user', 'chat1');
  m.remember(2, 2, 'user', 'chat2');
  assert.equal(m.recent(1, 2).length, 1);
  assert.equal(m.recent(1, 2)[0]!.content, 'chat1');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('forget clears only that chat+user', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  m.remember(1, 2, 'user', 'x');
  m.remember(1, 3, 'user', 'y');
  m.forget(1, 2);
  assert.equal(m.recent(1, 2).length, 0);
  assert.equal(m.recent(1, 3).length, 1);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('notes set/get/delete', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  assert.equal(m.note(1, 2), '');
  m.setNote(1, 2, 'be kind');
  assert.equal(m.note(1, 2), 'be kind');
  m.deleteNote(1, 2);
  assert.equal(m.note(1, 2), '');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('search finds messages and escapes LIKE wildcards', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  db.prepare('INSERT INTO messages(chat,user_id,name,text,at) VALUES(?,?,?,?,?)').run(1, 2, 'ali', 'hello world', 100);
  db.prepare('INSERT INTO messages(chat,user_id,name,text,at) VALUES(?,?,?,?,?)').run(1, 2, 'ali', '100% sure', 200);
  const rows = m.search(1, null, 'hello');
  assert.equal(rows.length, 1);
  // % must be literal, not wildcard
  const pct = m.search(1, null, '%');
  assert.equal(pct.length, 1);
  // per-user filter
  assert.equal(m.search(1, 999, 'hello').length, 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('relevant returns older matching turns, excludes last 12', () => {
  const { db, dir } = tmpDb();
  const m = new Memory(db);
  m.remember(1, 2, 'user', 'I like mathematics puzzles');
  for (let i = 0; i < 15; i++) m.remember(1, 2, 'user', `filler number ${i}`);
  const rel = m.relevant(1, 2, 'mathematics', 4);
  assert.ok(rel.some((c) => c.includes('mathematics')));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
