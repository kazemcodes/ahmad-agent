import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { ImageQueue } from '../src/queues/imageQueue.ts';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahmad-imgq-'));
  const p = path.join(dir, 'test.sqlite');
  const db = initDb(p);
  initSchema(db);
  return { db, dir };
}

test('enqueue dedupes by update_id', () => {
  const { db, dir } = tmpDb();
  const q = new ImageQueue(db);
  const a = q.enqueue({ update_id: 1 }, 100, 7, 1, 'a cat');
  const b = q.enqueue({ update_id: 1 }, 100, 7, 1, 'a cat');
  assert.equal(a.id, b.id);
  assert.equal(b.deduplicated, true);
  assert.equal(a.deduplicated, false);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('enqueue dedupes active (chat,user) job', () => {
  const { db, dir } = tmpDb();
  const q = new ImageQueue(db);
  q.enqueue({ update_id: 1 }, 100, 7, 1, 'a cat');
  const b = q.enqueue({ update_id: 2 }, 100, 7, 2, 'a dog');
  assert.equal(b.deduplicated, true);
  const c = q.enqueue({ update_id: 3 }, 100, 8, 3, 'a bird');
  assert.equal(c.deduplicated, false);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('claimNext claims oldest, complete + fail retry', () => {
  const { db, dir } = tmpDb();
  const q = new ImageQueue(db);
  q.enqueue({ update_id: 1 }, 100, 7, 1, 'a');
  q.enqueue({ update_id: 2 }, 200, 8, 2, 'b');
  const j1 = q.claimNext(300);
  assert.ok(j1);
  assert.equal(j1!.prompt, 'a');
  assert.equal(j1!.attempts, 1);
  q.complete(j1!.id);
  const j2 = q.claimNext(300);
  assert.equal(j2!.prompt, 'b');
  q.fail(j2!.id, 'oops', 0); // retry immediately
  const j3 = q.claimNext(300);
  assert.equal(j3!.id, j2!.id);
  assert.equal(j3!.attempts, 2);
  q.fail(j3!.id, 'final');
  assert.equal(q.claimNext(300), null);
  assert.equal(q.pendingCount(), 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('position reflects queue depth', () => {
  const { db, dir } = tmpDb();
  const q = new ImageQueue(db);
  const a = q.enqueue({ update_id: 1 }, 100, 7, 1, 'a');
  const b = q.enqueue({ update_id: 2 }, 200, 8, 2, 'b');
  assert.equal(a.position, 1);
  assert.equal(b.position, 2);
  const claimed = q.claimNext(300);
  assert.equal(q.position(claimed!.id), 1); // processing → position 1
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
