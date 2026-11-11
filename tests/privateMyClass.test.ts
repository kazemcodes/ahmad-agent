import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, initSchema } from '../src/db.ts';
import { ClassInstructions } from '../src/classInstructions.ts';
import { PvRepo } from '../src/pvRepo.ts';
import { createPrivateMyClass, MAIN_KEYBOARD, UNLINKED_KEYBOARD, UPLOAD_KEYBOARD, CANCEL_KEYBOARD } from '../src/useCases/privateMyClass.ts';
import { MyClassClient, type MyClassErrorResult } from '../src/myclassClient.ts';
import { MAX_IMAGE_BYTES, detectImageMime, downloadBaleImage } from '../src/baleImageReader.ts';
import { dispatch } from '../src/dispatcher.ts';
import type { ChatContext, Deps } from '../src/context.ts';

interface SentMessage {
  chat: number;
  text: string;
  reply?: number | null;
  replyMarkup?: unknown;
}

function setupHarness(clientStub: any = {}, downloadStub?: any) {
  const db = initDb(':memory:');
  initSchema(db);
  const repo = new PvRepo(db);
  const sent: SentMessage[] = [];
  const logs: Array<{ event: string; ctx?: Record<string, unknown> }> = [];
  let imageQueued = false;
  let aiCalled = false;

  const deps: any = {
    config: {
      admin_ids: new Set(['1']),
      bot_username: 'test_bot',
      bale_token: 'bale-test-token',
      myclass_api_url: 'https://myclass.test',
      myclass_bot_token: 'myclass-secret',
      myclass_timeout_ms: 90000,
      grace_minutes: 7,
      fuzzy_match: true,
      chat_limit: 60,
      image_limit: 10,
      message_chars: 4000,
      history_turns: 10,
      history_chars: 4000,
      search_key: '',
      ai_url: 'http://127.0.0.1:9',
      ai_key: 'sk-test',
      ai_model: 'gpt-test',
      vision_model: 'gpt-test',
      voice_model: 'whisper-1',
      voice_key: 'sk-test',
      voice_url: 'http://127.0.0.1:9',
      image_key: 'sk-test',
      image_model: 'gpt-image-1',
      gemini_image_key: '',
      gemini_image_model: '',
      image_provider: 'openai',
      max_output_tokens: 300,
    },
    db,
    log: (event: string, ctx?: Record<string, unknown>) => logs.push({ event, ctx }),
    send: async (chat: number, text: string, reply?: number | null, replyMarkup?: unknown) => {
      sent.push({ chat, text, reply, replyMarkup });
    },
    typing: async () => {},
    staff: (user: number) => user === 1,
    bale: {
      getFile: async (fileId: string) => ({ ok: true, result: { file_path: `photos/${fileId}.jpg` } }),
    },
    http: {
      http: async () => {
        aiCalled = true;
        return {};
      },
    },
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
      enqueue: () => {
        imageQueued = true;
        return { id: 1, deduplicated: false, position: 1 };
      },
    },
  };

  const uc = createPrivateMyClass({
    makeClient: () => clientStub,
    downloadImage:
      downloadStub ??
      (async (_tok: string, filePath: string, originalName?: string) => ({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        mime: 'image/jpeg',
        filename: originalName || `${filePath.split('/').pop()}`,
      })),
  });

  const sendPv = async (text: string, msgExtra: Record<string, unknown> = {}, userId = 501): Promise<boolean> => {
    const msgObj: any = {
      message_id: sent.length + 1,
      chat: { id: userId, type: 'private' },
      from: { id: userId, first_name: 'Student' },
      date: Math.floor(Date.now() / 1000),
      text,
      ...msgExtra,
    };
    const ctx: ChatContext = {
      update: { update_id: sent.length + 1, message: msgObj },
      msg: msgObj,
      chat: userId,
      user: userId,
      mid: msgObj.message_id,
      at: msgObj.date,
      text: (text || String(msgExtra.caption ?? '')).trim(),
      effectiveText: (text || String(msgExtra.caption ?? '')).trim(),
      name: 'Student',
      addressed: true,
      isBotReply: false,
      replyUsername: '',
      instructions: new ClassInstructions(db),
    };
    return uc(ctx, deps as Deps);
  };

  return { db, repo, sent, logs, deps, sendPv, wasAiCalled: () => aiCalled || imageQueued };
}

test('unlinked PV user gets welcome guide on /start and links single class with Persian national code', async () => {
  let lookedUpCode = '';
  const client = {
    lookupNationalCode: async (code: string) => {
      lookedUpCode = code;
      return {
        ok: true,
        national_code: '0012345678',
        students: [
          {
            student_id: 12,
            full_name: 'مهدی کریمی',
            teacher_id: 3,
            teacher_name: 'استاد باقری',
            school_name: 'دبیرستان علامه',
            class_name: 'یازدهم ۲',
          },
        ],
      };
    },
  };
  const h = setupHarness(client);

  await h.sendPv('/start');
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /کد ملی/);
  assert.deepEqual(h.sent[0].replyMarkup, UNLINKED_KEYBOARD);

  // Media before linking is refused cleanly
  await h.sendPv('', { photo: [{ file_id: 'ph1', file_size: 1000 }] });
  assert.match(h.sent[1].text, /ابتدا.*کد ملی/);
  assert.deepEqual(h.sent[1].replyMarkup, UNLINKED_KEYBOARD);

  // National code with Persian digits & hyphens pads leading zeros and links directly
  await h.sendPv('۱۲۳۴-۵۶۷۸');
  assert.equal(lookedUpCode, '0012345678');
  assert.match(h.sent[2].text, /مهدی کریمی/);
  assert.match(h.sent[2].text, /استاد باقری/);
  assert.deepEqual(h.sent[2].replyMarkup, MAIN_KEYBOARD);

  const link = h.repo.getLink(501);
  assert.ok(link);
  assert.equal(link.student_id, 12);
  assert.equal(link.national_code, '0012345678');
  h.db.close();
});

test('multi-class national code lets student pick class by number and switch later', async () => {
  const client = {
    lookupNationalCode: async () => ({
      ok: true,
      national_code: '0012345678',
      students: [
        { student_id: 1, full_name: 'رضا تهرانی', teacher_id: 10, teacher_name: 'استاد الف', school_name: 'مدرسه ۱', class_name: 'دهم ۱' },
        { student_id: 2, full_name: 'رضا تهرانی', teacher_id: 20, teacher_name: 'استاد ب', school_name: 'مدرسه ۲', class_name: 'دهم ۲' },
      ],
    }),
  };
  const h = setupHarness(client);

  await h.sendPv('۰۰۱۲۳۴۵۶۷۸');
  assert.equal(h.repo.getLink(501), undefined);
  assert.equal(h.repo.getState(501)?.state, 'choosing_class');
  assert.match(h.sent[0].text, /1\. استاد الف/);
  assert.match(h.sent[0].text, /2\. استاد ب/);
  assert.deepEqual(h.sent[0].replyMarkup, CANCEL_KEYBOARD);

  await h.sendPv('۲');
  assert.equal(h.repo.getLink(501)?.student_id, 2);
  assert.equal(h.repo.getState(501)?.state, 'menu');
  assert.deepEqual(h.sent[1].replyMarkup, MAIN_KEYBOARD);

  // Switch class later
  await h.sendPv('🔄 تغییر کد ملی / کلاس');
  assert.equal(h.repo.getState(501)?.state, 'choosing_switch_target');
  assert.match(h.sent[2].text, /0\. وارد کردن کد ملی جدید/);

  await h.sendPv('1');
  assert.equal(h.repo.getLink(501)?.student_id, 1);
  assert.deepEqual(h.sent[3].replyMarkup, MAIN_KEYBOARD);

  // Cancel switch with 0 -> awaiting_new_national_code -> ❌ انصراف restores menu without losing link
  await h.sendPv('🔄 تغییر کد ملی / کلاس');
  await h.sendPv('۰');
  assert.equal(h.repo.getState(501)?.state, 'awaiting_new_national_code');
  await h.sendPv('❌ انصراف');
  assert.equal(h.repo.getState(501)?.state, 'menu');
  assert.equal(h.repo.getLink(501)?.student_id, 1);
  h.db.close();
});

test('PV blocks all AI, chat, vision, voice, web, and image commands via dispatcher CHAIN[0]', async () => {
  const h = setupHarness();
  h.repo.upsertLink({
    user_id: 501,
    national_code: '0012345678',
    student_id: 1,
    full_name: 'سارا راد',
    teacher_name: 'استاد رضایی',
    school_name: 'دبیرستان',
    class_name: 'دهم',
  });

  const messages: Array<{ text: string; extra?: Record<string, unknown> }> = [
    { text: 'سلام خوبی چه خبر؟' },
    { text: '/image گربه زیبا' },
    { text: '/web اخبار جدید' },
    { text: '/search متن' },
    { text: '/class 08:00 09:00' },
    { text: '', extra: { photo: [{ file_id: 'ph1' }], caption: 'این چیه؟' } },
    { text: '', extra: { voice: { file_id: 'v1' } } },
    { text: '', extra: { sticker: { file_id: 's1' } } },
  ];

  for (const m of messages) {
    const msgObj: any = {
      message_id: 99,
      chat: { id: 501, type: 'private' },
      from: { id: 501, first_name: 'Sara' },
      date: Math.floor(Date.now() / 1000),
      text: m.text,
      ...m.extra,
    };
    const handled = await dispatch(
      {
        update: { update_id: 1, message: msgObj },
        msg: msgObj,
        chat: 501,
        user: 501,
        mid: 99,
        at: msgObj.date,
        text: m.text,
        effectiveText: m.text,
        name: 'Sara',
        addressed: true,
        isBotReply: false,
        replyUsername: '',
        instructions: new ClassInstructions(h.db),
      },
      h.deps,
    );
    assert.equal(handled, true);
  }

  assert.equal(h.wasAiCalled(), false);
  assert.equal(h.sent.length, messages.length);
  for (const s of h.sent) {
    assert.match(s.text, /دکمه‌های منو/);
    assert.deepEqual(s.replyMarkup, MAIN_KEYBOARD);
  }
  h.db.close();
});

test('attendance flow supports single auto check-in, multi-period selection, closed error, and stale link reset', async () => {
  let checkInStep = 0;
  const client = {
    checkInAttendance: async (_sid: number, _code: string, _uid: number, period?: number) => {
      checkInStep++;
      if (checkInStep === 1) {
        return {
          ok: true,
          needs_selection: false,
          already_checked_in: false,
          message: 'حضور شما در «زنگ اول» با موفقیت ثبت شد.',
          attendance: { date: '2026-10-12', period: 1, title: 'زنگ اول', status: 'present', status_label: 'حاضر', checked_in_at: '08:15' },
        };
      }
      if (checkInStep === 2) {
        return {
          ok: true,
          needs_selection: true,
          already_checked_in: false,
          message: 'چند زنگ هم‌زمان باز است؛ لطفاً شماره زنگ را انتخاب کنید.',
          open_periods: [
            { period: 1, title: 'زنگ اول', start_time: '08:00', cutoff_time: '08:30', is_quick_open: false, quick_open_until: null },
            { period: 2, title: 'زنگ جبرانی', start_time: '08:15', cutoff_time: '09:00', is_quick_open: true, quick_open_until: '09:30' },
          ],
        };
      }
      if (checkInStep === 3) {
        assert.equal(period, 2);
        return {
          ok: true,
          needs_selection: false,
          already_checked_in: false,
          message: 'حضور شما در «زنگ جبرانی» با موفقیت ثبت شد.',
          attendance: { date: '2026-10-12', period: 2, title: 'زنگ جبرانی', status: 'present', status_label: 'حاضر', checked_in_at: '08:20' },
        };
      }
      if (checkInStep === 4) {
        return {
          ok: false,
          status: 422,
          code: 'no_open_period',
          message: 'مهلت اعلام حضور به پایان رسیده است.',
        } satisfies MyClassErrorResult;
      }
      return {
        ok: false,
        status: 404,
        code: 'student_not_found',
        message: 'اطلاعات دانش‌آموز یا کلاس فعال پیدا نشد. لطفاً دوباره با کد ملی متصل شوید.',
      } satisfies MyClassErrorResult;
    },
  };
  const h = setupHarness(client);
  h.repo.upsertLink({
    user_id: 501,
    national_code: '0012345678',
    student_id: 1,
    full_name: 'حسین رضایی',
    teacher_name: 'استاد',
    school_name: 'مدرسه',
    class_name: 'دهم',
  });

  // 1. Single open period auto check-in
  await h.sendPv('✅ ثبت حضور');
  assert.match(h.sent[0].text, /زنگ اول.*با موفقیت ثبت شد/);
  assert.deepEqual(h.sent[0].replyMarkup, MAIN_KEYBOARD);
  const logsAfter1 = h.repo.listAttendanceLogs(501, '2026-10-12');
  assert.equal(logsAfter1.length, 1);
  assert.equal(logsAfter1[0].period_number, 1);
  assert.equal((h.db.prepare('SELECT COUNT(*) AS n FROM reply_checkins').get() as any).n, 0);

  // 2. Multiple open periods -> selection -> period 2 logged
  await h.sendPv('✅ ثبت حضور');
  assert.equal(h.repo.getState(501)?.state, 'choosing_attendance_period');
  assert.match(h.sent[1].text, /1\. زنگ اول/);
  assert.match(h.sent[1].text, /2\. زنگ جبرانی/);
  await h.sendPv('2');
  assert.equal(h.repo.getState(501)?.state, 'menu');
  assert.equal(h.repo.listAttendanceLogs(501, '2026-10-12').length, 2);

  // 3. Closed period returns exact server error
  await h.sendPv('✅ ثبت حضور');
  assert.match(h.sent[3].text, /مهلت اعلام حضور به پایان رسیده است/);

  // 4. Stale/deactivated student_not_found unlinks student cleanly
  await h.sendPv('✅ ثبت حضور');
  assert.equal(h.repo.getLink(501), undefined);
  assert.equal(h.repo.getState(501), undefined);
  assert.deepEqual(h.sent[4].replyMarkup, UNLINKED_KEYBOARD);
  h.db.close();
});

test('homework flow warns before resubmitting graded homework, stages multiple photos/captions, rejects PDF/oversize, and uploads all together', async () => {
  let submittedArgs: any = null;
  const client = {
    listHomeworks: async () => ({
      ok: true,
      total: 2,
      homeworks: [
        {
          id: 101,
          title: 'تکلیف جدید ریاضی',
          description: null,
          subject: 'ریاضی',
          due_date: '2026-10-20',
          due_time: '23:59',
          created_at: '2026-10-12 09:00',
          submitted: false,
          submitted_files_count: 0,
          submitted_at: null,
          score: null,
          feedback: null,
        },
        {
          id: 100,
          title: 'تکلیف قبلی نمره‌دار',
          description: null,
          subject: 'فیزیک',
          due_date: '2026-10-19',
          due_time: '20:00',
          created_at: '2026-10-10 08:00',
          submitted: true,
          submitted_files_count: 2,
          submitted_at: '2026-10-11 15:00',
          score: 18.5,
          feedback: 'خوب',
        },
      ],
    }),
    submitHomework: async (homeworkId: number, studentId: number, nationalCode: string, files: any[], note?: string) => {
      submittedArgs = { homeworkId, studentId, nationalCode, filesCount: files.length, note };
      return {
        ok: true,
        message: 'تکلیف با موفقیت ارسال شد.',
        submission: {
          homework_id: homeworkId,
          files_count: files.length,
          submitted_at: '2026-10-12 10:15',
          note: note ?? null,
        },
      };
    },
  };
  const h = setupHarness(client);
  h.repo.upsertLink({
    user_id: 501,
    national_code: '0012345678',
    student_id: 7,
    full_name: 'نیما صادقی',
    teacher_name: 'استاد',
    school_name: 'دبیرستان',
    class_name: 'دهم',
  });

  // Fetch active homeworks (newest first)
  await h.sendPv('📚 ارسال تکلیف');
  assert.equal(h.repo.getState(501)?.state, 'choosing_homework');
  const listIdx1 = h.sent[0].text.indexOf('1. تکلیف جدید ریاضی');
  const listIdx2 = h.sent[0].text.indexOf('2. تکلیف قبلی نمره‌دار');
  assert.ok(listIdx1 >= 0 && listIdx2 > listIdx1);
  assert.match(h.sent[0].text, /نمره: 18.5/);

  // Selecting graded homework #2 shows clear warning BEFORE staging
  await h.sendPv('2');
  const warnMsg = h.sent[1].text;
  assert.match(warnMsg, /هشدار/);
  assert.match(warnMsg, /18.5/);
  assert.match(warnMsg, /جایگزین/);
  assert.deepEqual(h.sent[1].replyMarkup, UPLOAD_KEYBOARD);

  // PDF document rejected immediately
  await h.sendPv('', { document: { file_id: 'doc1', file_name: 'ans.pdf', mime_type: 'application/pdf', file_size: 5000 } });
  assert.match(h.sent[2].text, /فقط فایل‌های تصویری/);

  // Single image > 8 MB rejected immediately
  await h.sendPv('', { photo: [{ file_id: 'big1', file_size: MAX_IMAGE_BYTES + 1 }] });
  assert.match(h.sent[3].text, /۸ مگابایت/);

  // Stage 2 photos + 1 image document (with captions -> combined note)
  await h.sendPv('', { photo: [{ file_id: 'small', file_size: 1000 }, { file_id: 'big_p1', file_size: 4000 }], caption: 'صفحه اول' });
  await h.sendPv('', { photo: [{ file_id: 'big_p2', file_size: 4000 }] });
  await h.sendPv('', { document: { file_id: 'doc_img', file_name: 'page3.png', mime_type: 'image/png', file_size: 4000 }, caption: 'صفحه سوم' });

  assert.match(h.sent[4].text, /عکس شماره 1/);
  assert.match(h.sent[5].text, /عکس شماره 2/);
  assert.match(h.sent[6].text, /عکس شماره 3/);

  // Pressing another menu button during upload warns instead of losing staged files
  await h.sendPv('✅ ثبت حضور');
  assert.equal(h.repo.getState(501)?.state, 'uploading_homework');
  assert.match(h.sent[7].text, /در حال ارسال عکس برای تکلیف/);

  // Help during upload preserves staged files
  await h.sendPv('ℹ️ راهنما');
  assert.equal(h.repo.getState(501)?.state, 'uploading_homework');
  assert.match(h.sent[8].text, /3 از ۱۰/);

  // Finalize uploads all 3 files together
  await h.sendPv('✅ ثبت نهایی');
  assert.ok(submittedArgs);
  assert.equal(submittedArgs.homeworkId, 100);
  assert.equal(submittedArgs.filesCount, 3);
  assert.equal(submittedArgs.note, 'صفحه اول\nصفحه سوم');
  assert.equal(h.repo.getState(501)?.state, 'menu');
  assert.equal(h.repo.getState(501)?.payload, null);
  assert.match(h.sent[h.sent.length - 1].text, /تکلیف با موفقیت ارسال شد/);
  assert.deepEqual(h.sent[h.sent.length - 1].replyMarkup, MAIN_KEYBOARD);
  h.db.close();
});

test('upload finalizer preserves staged photos on transient 5xx or downloaded batch >20MB for retry', async () => {
  let attempt = 0;
  let forceHugeDownload = true;

  const client = {
    submitHomework: async () => {
      attempt++;
      if (attempt === 1) {
        return {
          ok: false,
          status: 500,
          code: 'server_error',
          message: 'خطای موقت سرور رخ داد.',
        } satisfies MyClassErrorResult;
      }
      return {
        ok: true,
        message: 'تکلیف با موفقیت ارسال شد.',
        submission: { homework_id: 55, files_count: 2, submitted_at: '2026-10-12 11:00', note: null },
      };
    },
  };

  const downloadStub = async (_tok: string, _fp: string, name?: string) => ({
    // 11 MB each when forceHugeDownload is true (so 2 files = 22 MB > 20 MB total cap)
    buffer: Buffer.alloc(forceHugeDownload ? 11 * 1024 * 1024 : 5000, 0xaa),
    mime: 'image/jpeg',
    filename: name || 'p.jpg',
  });

  const h = setupHarness(client, downloadStub);
  h.repo.upsertLink({
    user_id: 501,
    national_code: '0012345678',
    student_id: 7,
    full_name: 'امیر',
    teacher_name: 'استاد',
    school_name: 'مدرسه',
    class_name: 'دهم',
  });
  h.repo.setState(501, 'uploading_homework', {
    homework_id: 55,
    homework_title: 'تمرین زیست',
    already_submitted: false,
    submitted_files_count: 0,
    score: null,
    files: [
      { file_id: 'f1', file_name: 'p1.jpg', is_document: false },
      { file_id: 'f2', file_name: 'p2.jpg', is_document: false },
    ],
  });

  // 1. Downloaded batch > 20 MB rejected cleanly while preserving staged files
  await h.sendPv('✅ ثبت نهایی');
  assert.equal(attempt, 0);
  assert.equal(h.repo.getState(501)?.state, 'uploading_homework');
  assert.equal((h.repo.getState(501)?.payload as any).files.length, 2);
  assert.match(h.sent[h.sent.length - 1].text, /۲۰ مگابایت/);

  // 2. Server 500 failure preserves staged files for retry
  forceHugeDownload = false;
  await h.sendPv('✅ ثبت نهایی');
  assert.equal(attempt, 1);
  assert.equal(h.repo.getState(501)?.state, 'uploading_homework');
  assert.match(h.sent[h.sent.length - 1].text, /خطای موقت سرور رخ داد/);

  // 3. Retry succeeds cleanly
  await h.sendPv('✅ ثبت نهایی');
  assert.equal(attempt, 2);
  assert.equal(h.repo.getState(501)?.state, 'menu');
  assert.match(h.sent[h.sent.length - 1].text, /تکلیف با موفقیت ارسال شد/);
  h.db.close();
});

test('MyClassClient sends Bearer token, multipart files[], and extracts server Persian errors cleanly', async () => {
  const captured: Array<{ url: string; headers: any; body: unknown }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    captured.push({
      url: String(input),
      headers: init?.headers,
      body: init?.body,
    });
    if (String(input).endsWith('/submit')) {
      return new Response(
        JSON.stringify({ ok: false, code: 'homework_expired', message: 'مهلت ارسال این تکلیف به پایان رسیده است.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, national_code: '0012345678', students: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const client = new MyClassClient('https://example.com', 'tok-xyz', 15000, fakeFetch);
  const res1 = await client.lookupNationalCode('0012345678', 900);
  assert.equal(res1.ok, true);
  assert.equal(captured[0].url, 'https://example.com/api/myclass/bot/lookup');
  assert.equal(captured[0].headers.Authorization, 'Bearer tok-xyz');

  const res2 = await client.submitHomework(
    5,
    12,
    '0012345678',
    [{ buffer: Buffer.from([1, 2, 3]), filename: 'a.jpg', mime: 'image/jpeg' }],
    'توضیح',
  );
  assert.equal(res2.ok, false);
  if (!res2.ok) {
    assert.equal(res2.status, 422);
    assert.equal(res2.code, 'homework_expired');
    assert.equal(res2.message, 'مهلت ارسال این تکلیف به پایان رسیده است.');
  }
  assert.ok(captured[1].body instanceof FormData);
});

test('downloadBaleImage enforces 8MB cap, detects real image bytes, and rejects disguised PDFs', async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const heicBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
  const pdfBytes = Buffer.from('%PDF-1.7 disguised content', 'ascii');

  assert.equal(detectImageMime(pngBytes), 'image/png');
  assert.equal(detectImageMime(heicBytes), 'image/heic');
  assert.equal(detectImageMime(pdfBytes, 'homework.jpg'), null);

  const okRes = await downloadBaleImage(
    'bale-tok',
    'photos/file_1.bin',
    'answer',
    MAX_IMAGE_BYTES,
    async () => new Response(pngBytes, { status: 200 }),
  );
  assert.equal(okRes.mime, 'image/png');
  assert.equal(okRes.filename, 'answer.png');

  await assert.rejects(
    () =>
      downloadBaleImage(
        'bale-tok',
        'photos/huge.jpg',
        'huge.jpg',
        1024,
        async () => new Response(Buffer.alloc(2048, 0xff), { status: 200 }),
      ),
    /۸ مگابایت/,
  );

  await assert.rejects(
    () =>
      downloadBaleImage(
        'bale-tok',
        'photos/fake.jpg',
        'fake.jpg',
        MAX_IMAGE_BYTES,
        async () => new Response(pdfBytes, { status: 200 }),
      ),
    /فقط فایل‌های تصویری/,
  );
});
