import test from 'node:test';
import assert from 'node:assert/strict';
import { levenshtein, bestMatch } from '../src/fuzzyMatch.ts';

test('levenshtein identical = 0', () => {
  assert.equal(levenshtein('abc', 'abc'), 0);
});

test('levenshtein empty', () => {
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
});

test('levenshtein normalization ي/ك', () => {
  assert.equal(levenshtein('يک', 'یك'), 0);
});

test('bestMatch exact returns candidate', () => {
  assert.equal(bestMatch('ali', ['ali', 'bob']), 'ali');
});

test('bestMatch within threshold', () => {
  assert.equal(bestMatch('alice', ['alice', 'bob']), 'alice');
  assert.equal(bestMatch('alic', ['alice', 'bob']), 'alice');
});

test('bestMatch far string returns null', () => {
  assert.equal(bestMatch('zzzzzzzz', ['ali', 'bob']), null);
});

test('bestMatch Persian normalization', () => {
  assert.equal(bestMatch('يوسف', ['یوسف']), 'یوسف');
});
