import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetHistory } from '../src/contextBudget.ts';

const turns = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi' },
  { role: 'user', content: 'how are you' },
];

test('returns all when within budget', () => {
  const out = budgetHistory(turns, 6, 3000);
  assert.equal(out.length, 3);
});

test('respects maxTurns', () => {
  const out = budgetHistory(turns, 2, 3000);
  assert.deepEqual(out.map((m) => m.content), ['hi', 'how are you']);
});

test('respects maxChars', () => {
  const long = [{ role: 'user', content: 'a'.repeat(500) }];
  const out = budgetHistory(long, 6, 200);
  assert.equal(out.length, 1);
  assert.ok(out[0]!.content.length <= 201); // truncated + ellipsis
});

test('zero limits → empty', () => {
  assert.deepEqual(budgetHistory(turns, 0, 3000), []);
  assert.deepEqual(budgetHistory(turns, 6, 0), []);
});

test('skips non user/assistant roles', () => {
  const out = budgetHistory([{ role: 'system', content: 'x' }, ...turns], 6, 3000);
  assert.ok(out.every((m) => m.role === 'user' || m.role === 'assistant'));
});
