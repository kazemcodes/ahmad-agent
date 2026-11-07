import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInName } from '../src/attendanceCheckIn.ts';

test('plain name + حاضر', () => {
  assert.equal(checkInName('یوسف کریمی حاضر'), 'یوسف کریمی');
});

test('with punctuation', () => {
  assert.equal(checkInName('یوسف کریمی حاضر!'), 'یوسف کریمی');
  assert.equal(checkInName('یوسف کریمی حاضر!؟'), 'یوسف کریمی');
});

test('too short name rejected', () => {
  assert.equal(checkInName('ی حاضر'), null);
});

test('no حاضر = null', () => {
  assert.equal(checkInName('سلام'), null);
  assert.equal(checkInName('حاضر'), null);
});

test('name with digits rejected', () => {
  assert.equal(checkInName('یوسف 123 حاضر'), null);
});

test('arabic yeh/kaf normalized', () => {
  assert.equal(checkInName('يوسف كريمي حاضر'), 'یوسف کریمی');
});
