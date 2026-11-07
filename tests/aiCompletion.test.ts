import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCompletion } from '../src/aiCompletion.ts';

test('message.content string', () => {
  const r = extractCompletion({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] });
  assert.equal(r.text, 'hello');
  assert.equal(r.finishReason, 'stop');
});

test('content in reasoning_content', () => {
  const r = extractCompletion({ choices: [{ message: { content: null, reasoning_content: 'r' } }] });
  assert.equal(r.text, 'r');
});

test('content in choice.text', () => {
  const r = extractCompletion({ choices: [{ text: 'hi' }] });
  assert.equal(r.text, 'hi');
});

test('finish_reason length + empty content', () => {
  const r = extractCompletion({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
  assert.equal(r.text, null);
  assert.equal(r.finishReason, 'length');
  assert.ok(r.shape.length > 0);
});

test('array-part content joined', () => {
  const r = extractCompletion({
    choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }],
  });
  assert.equal(r.text, 'ab');
});

test('delta.content', () => {
  const r = extractCompletion({ choices: [{ delta: { content: 'stream' } }] });
  assert.equal(r.text, 'stream');
});

test('no choices → null', () => {
  const r = extractCompletion({});
  assert.equal(r.text, null);
  assert.equal(r.finishReason, null);
});
