import test from 'node:test';
import assert from 'node:assert/strict';
import { classroomIntent } from '../src/classroomIntent.ts';

test('attendance question → /report', () => {
  assert.equal(classroomIntent('آقای ناظر کیا حاضر بودند؟', true), '/report');
  assert.equal(classroomIntent('کی حاضر بود؟', true), '/report');
  assert.equal(classroomIntent('کیا امروز حاضر شدن؟', true), '/report');
  assert.equal(classroomIntent('چند نفر امروز حاضرند؟', true), '/report');
  assert.equal(classroomIntent('گزارش حضور امروز رو بده', true), '/report');
  assert.equal(classroomIntent('لیست حاضران', true), '/report');
  assert.equal(classroomIntent('حاضران امروز کیا هستن؟', true), '/report');
});

test('general questions mentioning حاضر / حضور do NOT trigger /report', () => {
  assert.equal(classroomIntent('آقای ناظر در حال حاضر قیمت دلار چنده؟ بگو', true), null);
  assert.equal(classroomIntent('آقای ناظر در حال حاضر چه کتابی برای امروز خوبه؟', true), null);
  assert.equal(classroomIntent('آقای ناظر بگو چطور باید حاضر بزنیم؟', true), null);
  assert.equal(classroomIntent('آقای ناظر آیا امروز کلاس حضوری هست؟', true), null);
  assert.equal(classroomIntent('آقای ناظر حاضری یه سوال ریاضی بپرسم؟', true), null);
  assert.equal(classroomIntent('آقای ناظر کی حاضره کمکم کنه؟', true), null);
  assert.equal(classroomIntent('آقای ناظر یکی از بچه‌ها امروز حاضر نیست چیکار کنه؟', true), null);
  assert.equal(classroomIntent('آقای ناظر اگه کسی امروز حاضر نباشه چی میشه؟', true), null);
  assert.equal(classroomIntent('آقای ناظر توضیح بده در حال حاضر وضعیت چطوره', true), null);
  assert.equal(classroomIntent('آقای ناظر علی امروز حاضر بود یا نه؟', true), null);
});

test('schedule today → /today', () => {
  assert.equal(classroomIntent('برنامه امروز چیه؟', true), '/today');
  assert.equal(classroomIntent('امروز ساعت چنده؟', true), null);
  assert.equal(classroomIntent('برنامه‌نویسی امروز داریم؟', true), null);
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
