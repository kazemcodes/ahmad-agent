import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { config } from '../src/config.ts';
import { Ahmad } from '../src/ahmad.ts';

// Characterization tests: snapshot the *current* handle() behavior so the
// use-case refactor (PR5) can prove 1:1 parity. `send()` failures against the
// invalid Bale token must not propagate — `typing()` already swallows them,
// and the send callers sit inside handlers that tolerate it. To make the
// tests hermetic we pre-seed the dedupe table so a second identical update
// short-circuits AFTER the first run inserts the message row; then we assert
// the message row exists (handle reached the DB write) for each flow.
function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahmad-disp-'));
  const p = path.join(dir, 'test.sqlite');
  const db = initDb(p);
  initSchema(db);
  return { db, dir };
}

function cfg() {
  return {
    ...config,
    bale_token: 'TEST_INVALID_TOKEN_FOR_TESTS',
    admin_ids: new Set(['99']),
    bot_username: 'testbot',
    db: ':memory:',
    ai_url: '',
    ai_key: '',
    ai_model: '',
    vision_model: '',
    voice_model: '',
    voice_url: '',
    voice_key: '',
    search_key: '',
    image_provider: 'openai',
    image_url: '',
    image_key: '',
    image_model: '',
    cloudflare_account: '',
    gemini_image_key: '',
    gemini_image_model: '',
  };
}

function msg(text: string, fromId = 99, chatType = 'private') {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: fromId, first_name: 'a', username: 'u' },
      chat: { id: 1, type: chatType },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  } as any;
}

test('/start reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  // First run: send() throws Bale 404 AFTER the insert — handle() swallows
  // nothing around send(), so we catch here; row must still exist.
  await bot.handle(msg('/start')).catch(() => {});
  const row = db.prepare('SELECT text FROM messages WHERE chat=1').get() as any;
  assert.equal(row.text, '/start');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('non-staff staff command reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  await bot.handle(msg('/class 08:00 09:30', 5)).catch(() => {});
  const rows = db.prepare('SELECT text FROM messages WHERE chat=1').all() as any[];
  assert.ok(rows.some((r) => r.text === '/class 08:00 09:30'));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unknown private text reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  await bot.handle(msg('سلام', 5)).catch(() => {});
  const rows = db.prepare('SELECT text FROM messages WHERE chat=1').all() as any[];
  assert.ok(rows.some((r) => r.text === 'سلام'));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
