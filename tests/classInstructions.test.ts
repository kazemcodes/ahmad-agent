import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { ClassInstructions, parseInstruction } from '../src/classInstructions.ts';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahmad-ci-'));
  const p = path.join(dir, 'test.sqlite');
  const db = initDb(p);
  initSchema(db);
  return { db, dir };
}

test('parse یادت باشه', () => {
  assert.equal(parseInstruction('یادت باشه همیشه آرام حرف بزن'), 'همیشه آرام حرف بزن');
  assert.equal(parseInstruction('آقای ناظر یادت باشه کوتاه جواب بده'), 'کوتاه جواب بده');
});

test('parse non-matching returns null', () => {
  assert.equal(parseInstruction('سلام'), null);
  assert.equal(parseInstruction('یادت باشه'), null);
});

test('add/list/delete round-trip', () => {
  const { db, dir } = tmpDb();
  const ci = new ClassInstructions(db);
  const id = ci.add(1, 99, 'rule one');
  assert.ok(id > 0);
  const list = ci.list(1);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.instruction, 'rule one');
  assert.equal(ci.remove(1, id), true);
  assert.equal(ci.list(1).length, 0);
  // per-chat isolation
  ci.add(2, 99, 'other chat');
  assert.equal(ci.list(1).length, 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
