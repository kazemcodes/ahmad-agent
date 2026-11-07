import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, initSchema } from '../src/db.ts';
import { ClassInstructions } from '../src/classInstructions.ts';
import { startHelp } from '../src/useCases/start.ts';
import { replyCheckIn } from '../src/useCases/replyCheckIn.ts';
import { classInstructionsCmd } from '../src/useCases/classInstructionsCmd.ts';
import { staffCommands } from '../src/useCases/staffCommands.ts';
import { correctRequest } from '../src/useCases/correctRequest.ts';
import { nameCheckIn } from '../src/useCases/nameCheckIn.ts';
import { searchCmd } from '../src/useCases/search.ts';
import { webSearchCmd } from '../src/useCases/webSearchCmd.ts';
import { voiceCmd } from '../src/useCases/voice.ts';
import { documentSticker } from '../src/useCases/documentSticker.ts';
import { visionCmd } from '../src/useCases/vision.ts';
import { imageRequest } from '../src/useCases/imageRequest.ts';
import { chatCmd } from '../src/useCases/chat.ts';

function setup() {
  const db = initDb(':memory:');
  initSchema(db);
  const sent: Array<{ chat: number; text: string; reply?: number | null }> = [];
  const logs: Array<{ event: string; ctx?: Record<string, unknown> }> = [];
  const deps: any = {
    config: {
      admin_ids: new Set(['1']),
      bot_username: 'test_bot',
      grace_minutes: 7,
      fuzzy_match: true,
      chat_limit: 60,
      image_limit: 10,
      message_chars: 4000,
      history_turns: 10,
      history_chars: 4000,
      search_key: '',
      ai_url: '',
      ai_key: '',
      ai_model: '',
      vision_model: '',
      voice_model: '',
      voice_key: '',
      voice_url: '',
      image_key: '',
      image_model: '',
      gemini_image_key: '',
      gemini_image_model: '',
      image_provider: 'openai',
      bale_token: 'tok',
      max_output_tokens: 0,
    },
    db,
    log: (event: string, ctx?: Record<string, unknown>) => logs.push({ event, ctx }),
    send: async (chat: number, text: string, reply?: number | null) => sent.push({ chat, text, reply }),
    typing: async () => {},
    staff: (user: number) => user === 1,
    bale: { getFile: async () => ({ result: { file_path: '' } }) },
    http: { http: async () => ({}) },
    memory: {
      search: () => [],
      forget: () => {},
      deleteNote: () => {},
      setNote: () => {},
      recent: () => [],
      relevant: () => [],
      note: () => '',
      remember: () => {},
      observeUser: () => {},
    },
    queue: { allow: () => true },
    imageQueue: {
      enqueue: () => ({ id: 1, deduplicated: false, position: 1 }),
    },
  };
  return { db, sent, logs, deps };
}

function ctx(over: Partial<any> = {}) {
  const db = new Map();
  return {
    update: { update_id: 1 },
    msg: { chat: { id: 100, type: 'group' }, from: { id: 2, first_name: 'Stu' } },
    chat: 100,
    user: 2,
    mid: 5,
    at: Math.floor(Date.now() / 1000),
    text: '',
    effectiveText: '',
    name: 'Stu',
    addressed: false,
    isBotReply: false,
    replyUsername: '',
    instructions: null as any,
    ...over,
  };
}

test('startHelp handles /start, ignores other text', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/start', instructions: new ClassInstructions(db) });
  assert.equal(await startHelp(c, deps), true);
  assert.match(sent[0]!.text, /سلام، من آقای ناظر هستم/);
  const c2 = ctx({ text: 'hello', instructions: new ClassInstructions(db) });
  assert.equal(await startHelp(c2, deps), false);
  db.close();
});

test('replyCheckIn records a bot-reply check-in', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: 'علی حاضر', isBotReply: true, instructions: new ClassInstructions(db) });
  assert.equal(await replyCheckIn(c, deps), true);
  assert.match(sent[0]!.text, /حضور ثبت شد/);
  const rows = db.prepare('SELECT * FROM reply_checkins').all();
  assert.equal(rows.length, 1);
  db.close();
});

test('replyCheckIn ignores non-bot replies', async () => {
  const { db, deps } = setup();
  const c = ctx({ text: 'علی حاضر', isBotReply: false, instructions: new ClassInstructions(db) });
  assert.equal(await replyCheckIn(c, deps), false);
  db.close();
});

test('classInstructionsCmd stores a staff memory', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: 'یادت باشه ما هر هفته تمرین داریم', user: 1, addressed: true, instructions: new ClassInstructions(db) });
  assert.equal(await classInstructionsCmd(c, deps), true);
  assert.match(sent[0]!.text, /یادداشت شماره/);
  db.close();
});

test('staffCommands rejects non-staff', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/class 08:00 09:30', effectiveText: '/class 08:00 09:30', instructions: new ClassInstructions(db) });
  assert.equal(await staffCommands(c, deps), true);
  assert.match(sent[0]!.text, /فقط برای معلم یا مدیر/);
  db.close();
});

test('staffCommands /class stores window', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/class 08:00 09:30', effectiveText: '/class 08:00 09:30', user: 1, instructions: new ClassInstructions(db) });
  assert.equal(await staffCommands(c, deps), true);
  assert.match(sent[0]!.text, /ذخیره شد/);
  const row = db.prepare('SELECT * FROM classes').get();
  assert.equal(row.start, '08:00');
  db.close();
});

test('correctRequest queues a correction', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/correct علی جدید', instructions: new ClassInstructions(db) });
  assert.equal(await correctRequest(c, deps), true);
  assert.match(sent[0]!.text, /ثبت شد/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM corrections').get().n, 1);
  db.close();
});

test('nameCheckIn in active window links roster', async () => {
  const { db, sent, deps } = setup();
  db.prepare('INSERT INTO roster(chat,name) VALUES(?,?)').run(100, 'علی');
  // window spanning "now" (grace check is a string compare, so avoid midnight-wrap)
  const now = new Date();
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const start = hm(new Date(now.getTime() - 30 * 60000));
  const end = hm(new Date(now.getTime() + 30 * 60000));
  db.prepare('INSERT INTO classes(chat,start,end) VALUES(?,?,?)').run(100, start, end);
  const c = ctx({ text: 'علی', instructions: new ClassInstructions(db) });
  assert.equal(await nameCheckIn(c, deps), true);
  assert.match(sent[0]!.text, /حضورت ثبت شد/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance').get().n, 1);
  db.close();
});

test('searchCmd rejects short term', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/mysearch a', instructions: new ClassInstructions(db) });
  assert.equal(await searchCmd(c, deps), true);
  assert.match(sent[0]!.text, /حداقل دو حرف/);
  db.close();
});

test('webSearchCmd reports unconfigured', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/web سلام', instructions: new ClassInstructions(db) });
  assert.equal(await webSearchCmd(c, deps), true);
  assert.match(sent[0]!.text, /تنظیم نشده/);
  db.close();
});

test('voiceCmd ignores when not addressed', async () => {
  const { db, deps } = setup();
  const c = ctx({ msg: { chat: { id: 100, type: 'group' }, voice: { file_id: 'v1' } }, addressed: false, instructions: new ClassInstructions(db) });
  assert.equal(await voiceCmd(c, deps), false);
  db.close();
});

test('documentSticker handles sticker', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ msg: { chat: { id: 100, type: 'group' }, sticker: {} }, addressed: true, instructions: new ClassInstructions(db) });
  assert.equal(await documentSticker(c, deps), true);
  assert.match(sent[0]!.text, /استیکر دریافت شد/);
  db.close();
});

test('visionCmd ignores when not addressed', async () => {
  const { db, deps } = setup();
  const c = ctx({ msg: { chat: { id: 100, type: 'group' }, photo: [{ file_id: 'p' }] }, addressed: false, instructions: new ClassInstructions(db) });
  assert.equal(await visionCmd(c, deps), false);
  db.close();
});

test('imageRequest /video stub', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: '/video cat', instructions: new ClassInstructions(db) });
  assert.equal(await imageRequest(c, deps), true);
  assert.match(sent[0]!.text, /در دسترس نیست/);
  db.close();
});

test('chatCmd stays silent when not called', async () => {
  const { db, sent, deps } = setup();
  const c = ctx({ text: 'سلام', instructions: new ClassInstructions(db) });
  assert.equal(await chatCmd(c, deps), true);
  assert.equal(sent.length, 0);
  db.close();
});
