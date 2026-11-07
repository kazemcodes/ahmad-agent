import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, initSchema } from '../src/db.ts';
import { buildRepositories } from '../src/repositories.ts';

test('repositories round-trip against initSchema', () => {
  const db = initDb(':memory:');
  initSchema(db);
  const r = buildRepositories(db);

  // classes + schedules
  r.classes.upsertDaily(1, '08:00', '09:30');
  assert.deepEqual(r.classes.getDaily(1), { start: '08:00', end: '09:30' });
  r.classes.addSchedule(1, 6, '10:00', '11:00');
  assert.equal(r.classes.hasWeekly(1), true);
  assert.equal(r.classes.listSchedules(1).length, 1);
  assert.equal(r.classes.isScheduleActiveNow(1, 6, '10:30'), true);

  // attendance (no roster — reply_checkins only)
  r.attendance.addReplyCheckin(1, '2026-01-01', 42, 'ali', 100);
  assert.equal(r.attendance.replyExisting(1, '2026-01-01', 42)?.name, 'ali');
  assert.equal(r.attendance.listReplyToday(1, '2026-01-01').length, 1);
  r.attendance.addDaily(1, '2026-01-01', 1, 100);
  assert.equal(r.attendance.hasDaily(1, '2026-01-01', 1), true);

  // corrections
  r.corrections.add(1, 42, 'new name');
  assert.equal(r.corrections.listPending(1).length, 1);
  const pending = r.corrections.listPending(1)[0]!;
  r.corrections.approve(pending.id);
  assert.equal(r.corrections.listPending(1).length, 0);

  // updates dedup
  assert.equal(r.updates.seen(7), false);
  r.updates.markSeen(7);
  assert.equal(r.updates.seen(7), true);
  assert.equal(r.updates.seenOffset(), 8);

  db.close();
});
