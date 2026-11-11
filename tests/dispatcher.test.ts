import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, initSchema } from '../src/db.ts';
import { config } from '../src/config.ts';
import { Ahmad } from '../src/ahmad.ts';

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
    myclass_api_url: '',
    myclass_bot_token: '',
    myclass_timeout_ms: 90000,
  };
}

function msg(text: string, fromId = 99, chatType = 'group', chatId = -1001, extra: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: fromId, first_name: 'Ali', username: 'ali_u' },
      chat: { id: chatId, type: chatType, title: chatType === 'group' ? 'گروه دهم' : undefined },
      date: Math.floor(Date.now() / 1000),
      text,
      ...extra,
    },
  } as any;
}

test('group /start reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  await bot.handle(msg('/start', 99, 'group', -1001)).catch(() => {});
  const row = db.prepare('SELECT text FROM messages WHERE chat=-1001').get() as any;
  assert.equal(row.text, '/start');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('group non-staff staff command reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  await bot.handle(msg('/class 08:00 09:30', 5, 'group', -1001)).catch(() => {});
  const rows = db.prepare('SELECT text FROM messages WHERE chat=-1001').all() as any[];
  assert.ok(rows.some((r) => r.text === '/class 08:00 09:30'));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('group arbitrary text reaches the message-row insert', async () => {
  const { db, dir } = tmpDb();
  const bot = new Ahmad(cfg(), db);
  await bot.handle(msg('سلام', 5, 'group', -1001)).catch(() => {});
  const rows = db.prepare('SELECT text FROM messages WHERE chat=-1001').all() as any[];
  assert.ok(rows.some((r) => r.text === 'سلام'));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('private chat writes zero rows to messages, conversation_turns, observed_users, or reply_checkins and skips AI', async () => {
  const { db, dir } = tmpDb();
  const c = {
    ...cfg(),
    ai_url: 'http://127.0.0.1:9',
    ai_key: 'sk-test',
    ai_model: 'gpt-test',
  };
  const bot = new Ahmad(c, db);

  // Stub network calls so even AI / Bale calls never hit real network and fail loudly if AI were called
  let aiCalled = false;
  (bot as any).http = {
    http: async (url: string) => {
      if (url.includes('/chat/completions')) {
        aiCalled = true;
      }
      return { ok: true, result: {} };
    },
  };
  (bot as any).bale = {
    sendMessage: async () => ({ ok: true }),
    sendChatAction: async () => ({ ok: true }),
    answerCallbackQuery: async () => ({ ok: true }),
    getFile: async () => ({ ok: true, result: { file_path: '' } }),
  };

  await bot.handle(msg('/start', 500, 'private', 500));
  await bot.handle({ ...msg('سلام هوش مصنوعی حالت چطوره؟', 500, 'private', 500), update_id: 2 });
  await bot.handle({
    update_id: 3,
    edited_message: {
      message_id: 11,
      from: { id: 500, first_name: 'Ali', username: 'ali_u' },
      chat: { id: 500, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '۰۹۱۲۳۴۵۶۷۸ ویرایش',
    },
  } as any);
  await bot.handle({
    update_id: 4,
    callback_query: {
      id: 'cb-1',
      data: 'present:علی',
      from: { id: 500, first_name: 'Ali' },
      message: { message_id: 12, chat: { id: 500, type: 'private' } },
    },
  } as any);

  assert.equal(aiCalled, false);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM messages').get() as any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM conversation_turns').get() as any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM observed_users').get() as any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM reply_checkins').get() as any).n, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM spam_bans').get() as any).n, 0);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
