import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, initSchema } from '../src/db.ts';
import { PvRepo } from '../src/pvRepo.ts';
import { downloadBaleImage, MAX_IMAGE_BYTES } from '../src/baleImageReader.ts';

test('PvRepo manages bale_student_links lifecycle cleanly', () => {
  const db = initDb(':memory:');
  initSchema(db);
  const repo = new PvRepo(db);

  assert.equal(repo.getLink(100), undefined);

  repo.upsertLink(
    {
      user_id: 100,
      national_code: '0012345678',
      student_id: 42,
      full_name: 'محمد علی‌زاده',
      teacher_name: 'استاد رضایی',
      school_name: 'دبیرستان البرز',
      class_name: 'دهم ۱',
    },
    1000,
  );

  const first = repo.getLink(100);
  assert.ok(first);
  assert.equal(first.student_id, 42);
  assert.equal(first.linked_at, 1000);
  assert.equal(first.updated_at, 1000);

  // Switch class preserves original linked_at and updates student fields + updated_at
  repo.upsertLink(
    {
      user_id: 100,
      national_code: '0012345678',
      student_id: 99,
      full_name: 'محمد علی‌زاده',
      teacher_name: 'استاد حسینی',
      school_name: 'دبیرستان رازی',
      class_name: 'دهم ۲',
    },
    2000,
  );

  const second = repo.getLink(100);
  assert.ok(second);
  assert.equal(second.student_id, 99);
  assert.equal(second.teacher_name, 'استاد حسینی');
  assert.equal(second.linked_at, 1000);
  assert.equal(second.updated_at, 2000);

  repo.deleteLink(100);
  assert.equal(repo.getLink(100), undefined);
  db.close();
});

test('PvRepo stores, parses, and clears pv_states JSON payloads', () => {
  const db = initDb(':memory:');
  initSchema(db);
  const repo = new PvRepo(db);

  repo.setState(50, 'uploading_homework', {
    homework_id: 7,
    homework_title: 'تکلیف ریاضی',
    files: [{ file_id: 'f1', file_name: 'p1.jpg' }],
  }, 500);

  const st = repo.getState<{ homework_id: number; files: Array<{ file_id: string }> }>(50);
  assert.ok(st);
  assert.equal(st.state, 'uploading_homework');
  assert.equal(st.payload?.homework_id, 7);
  assert.equal(st.payload?.files.length, 1);

  repo.clearState(50);
  assert.equal(repo.getState(50), undefined);
  db.close();
});

test('PvRepo upserts pv_attendance_logs idempotently per (user_id, student_id, date, period_number)', () => {
  const db = initDb(':memory:');
  initSchema(db);
  const repo = new PvRepo(db);

  repo.upsertAttendanceLog({
    user_id: 100,
    student_id: 42,
    national_code: '0012345678',
    date: '2026-10-12',
    period_number: 1,
    period_title: 'زنگ اول',
    status: 'present',
  }, 1000);

  repo.upsertAttendanceLog({
    user_id: 100,
    student_id: 42,
    national_code: '0012345678',
    date: '2026-10-12',
    period_number: 1,
    period_title: 'زنگ اول (اصلاح شده)',
    status: 'present',
  }, 1500);

  const logs = repo.listAttendanceLogs(100, '2026-10-12');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].period_title, 'زنگ اول (اصلاح شده)');
  assert.equal(logs[0].synced_at, 1500);
  db.close();
});

test('downloadBaleImage validates path safety, max 8MB cap, and supported image types', async () => {
  // Rejects path traversal, leading slash, URL injection, and query strings
  await assert.rejects(
    () => downloadBaleImage('tok', '../secret.jpg'),
    /Invalid Bale file path/,
  );
  await assert.rejects(
    () => downloadBaleImage('tok', '/photos/a.jpg'),
    /Invalid Bale file path/,
  );
  await assert.rejects(
    () => downloadBaleImage('tok', 'https://evil.example/a.jpg'),
    /Invalid Bale file path/,
  );
  await assert.rejects(
    () => downloadBaleImage('tok', 'photos/a.jpg?token=1'),
    /Invalid Bale file path/,
  );

  // Accepts real Bale colon-separated file_path format
  const colonPath = '1247716850:-75023953490469117:0:b83b234337aee638dde88e8db2de8e4428';
  const colonRes = await downloadBaleImage(
    'tok',
    colonPath,
    'photo_1.jpg',
    MAX_IMAGE_BYTES,
    async (url) => {
      assert.equal(String(url), `https://tapi.bale.ai/file/bottok/${colonPath}`);
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), { status: 200 });
    },
  );
  assert.equal(colonRes.mime, 'image/jpeg');
  assert.equal(colonRes.filename, 'photo_1.jpg');

  // Rejects oversized image (> 8 MB)
  const bigBuf = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(MAX_IMAGE_BYTES + 1),
  ]);
  await assert.rejects(
    () =>
      downloadBaleImage(
        'tok',
        'photos/huge.jpg',
        'huge.jpg',
        MAX_IMAGE_BYTES,
        async () => new Response(bigBuf, { status: 200 }),
      ),
    /۸ مگابایت/,
  );

  // Rejects PDF disguised or explicit
  const pdfBuf = Buffer.from('%PDF-1.5 fake content');
  await assert.rejects(
    () =>
      downloadBaleImage(
        'tok',
        'docs/test.pdf',
        'test.pdf',
        MAX_IMAGE_BYTES,
        async () => new Response(pdfBuf, { status: 200 }),
      ),
    /تصویری/,
  );

  // Accepts JPEG, PNG, GIF, BMP, HEIC/AVIF magic headers cleanly
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const jpegRes = await downloadBaleImage(
    'tok',
    'photos/p1.jpg',
    'homework-page',
    MAX_IMAGE_BYTES,
    async () => new Response(jpegBuf, { status: 200 }),
  );
  assert.equal(jpegRes.mime, 'image/jpeg');
  assert.equal(jpegRes.filename, 'homework-page.jpg');

  const gifBuf = Buffer.from('GIF89a\x01\x00\x01\x00');
  const gifRes = await downloadBaleImage(
    'tok',
    'photos/anim.gif',
    'anim.gif',
    MAX_IMAGE_BYTES,
    async () => new Response(gifBuf, { status: 200 }),
  );
  assert.equal(gifRes.mime, 'image/gif');
  assert.equal(gifRes.filename, 'anim.gif');

  const heicBuf = Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1', 'latin1');
  const heicRes = await downloadBaleImage(
    'tok',
    'photos/ios.heic',
    'IMG_001.heic',
    MAX_IMAGE_BYTES,
    async () => new Response(heicBuf, { status: 200 }),
  );
  assert.equal(heicRes.mime, 'image/heic');
  assert.equal(heicRes.filename, 'IMG_001.heic');
});
