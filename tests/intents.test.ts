import test from 'node:test';
import assert from 'node:assert/strict';
import { classroomIntent } from '../src/classroomIntent.ts';

test('attendance question → /report', () => {
  assert.equal(classroomIntent('آقای ناظر کیا حاضر بودند؟', true), '/report');
  assert.equal(classroomIntent('کی حاضر بود؟', true), '/report');
});

test('schedule today → /today', () => {
  assert.equal(classroomIntent('برنامه امروز چیه؟', true), '/today');
});

test('schedule weekly → /schedules', () => {
  assert.equal(classroomIntent('برنامه کلاس چیه؟', true), '/schedules');
  assert.equal(classroomIntent('ساعت کلاس هفتگی؟', true), '/schedules');
});

test('slash commands unchanged', () => {
  assert.equal(classroomIntent('/report', true), null);
});

test('not addressed = null', () => {
  assert.equal(classroomIntent('کیا حاضر بودند؟', false), null);
});
