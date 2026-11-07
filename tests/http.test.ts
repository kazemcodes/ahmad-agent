import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, isForbidden } from '../src/http.ts';
import { Logger } from '../src/logger.ts';
import { HttpClient } from '../src/http.ts';

function stubFetch(status: number, body: string) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } })) as any;
  return () => {
    globalThis.fetch = original;
  };
}

const logger = new Logger('Asia/Tehran', ':memory:');

test('403 throws ForbiddenError', async () => {
  const restore = stubFetch(403, '{"ok":false}');
  try {
    await assert.rejects(
      new HttpClient(logger).http('https://tapi.bale.ai/botX/sendMessage', {}),
      ForbiddenError,
    );
  } finally {
    restore();
  }
});

test('isForbidden matches plain HTTP 403 errors', () => {
  assert.equal(isForbidden(new Error('Bale request failed: HTTP 403')), true);
  assert.equal(isForbidden(new Error('Bale request failed: HTTP 500')), false);
  assert.equal(isForbidden(new ForbiddenError('x')), true);
});

test('500 is not ForbiddenError', async () => {
  const restore = stubFetch(500, '{}');
  try {
    await assert.rejects(new HttpClient(logger).http('https://tapi.bale.ai/botX/sendMessage', {}), (e: Error) => {
      assert.equal(isForbidden(e), false);
      return true;
    });
  } finally {
    restore();
  }
});
