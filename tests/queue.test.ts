import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { RequestQueue } from '../src/queues/requestQueue.ts';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahmad-queue-'));
  const p = path.join(dir, 'test.sqlite');
  const db = initDb(p);
  initSchema(db);
  return { db, dir };
}

test('enqueue + offset', () => {
  const { db, dir } = tmpDb();
  const q = new RequestQueue(db);
  assert.equal(q.offset(), 0);
  q.enqueue({ update_id: 10, message: { text: 'hi' } });
  assert.equal(q.offset(), 11);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('processOne handles in order, dedupes by id', () => {
  const { db, dir } = tmpDb();
  const q = new RequestQueue(db);
  q.enqueue({ update_id: 1 });
  q.enqueue({ update_id: 1 }); // IGNORE
  q.enqueue({ update_id: 2 });
  const seen: number[] = [];
  assert.equal(q.processOne((u) => seen.push(u.update_id)), true);
  assert.deepEqual(seen, [1]);
  assert.equal(q.processOne((u) => seen.push(u.update_id)), true);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(q.processOne(() => {}), false);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('failed handler retries then fails after 3', () => {
  const { db, dir } = tmpDb();
  const q = new RequestQueue(db);
  q.enqueue({ update_id: 5 });
  let calls = 0;
  const fail = () => {
    calls++;
    throw new Error('boom');
  };
  // Force available_at to now before each processOne.
  for (let i = 0; i < 4; i++) {
    db.prepare('UPDATE request_queue SET available_at=0 WHERE id=5').run();
    q.processOne(fail);
  }
  assert.equal(calls, 3);
  const row = db.prepare('SELECT status,attempts FROM request_queue WHERE id=5').get() as { status: string; attempts: number };
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 3);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('allow rate limit', () => {
  const { db, dir } = tmpDb();
  const q = new RequestQueue(db);
  assert.equal(q.allow('chat', 1, 2, 60), true);
  assert.equal(q.allow('chat', 1, 2, 60), true);
  assert.equal(q.allow('chat', 1, 2, 60), false);
  assert.equal(q.allow('chat', 2, 2, 60), true); // different user
  assert.equal(q.allow('chat', 1, 0, 60), true); // limit 0 = disabled
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
