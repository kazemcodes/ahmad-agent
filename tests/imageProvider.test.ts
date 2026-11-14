import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageProvider } from '../src/image/provider.ts';

function stubFetch(body: string, status = 200) {
  const calls: Array<{ url: string; body: any }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  }) as any;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function cfg(overrides: Record<string, unknown>) {
  return {
    image_provider: 'openrouter',
    image_model: 'bytedance-seed/seedream-4.5',
    image_key: 'or-key',
    image_url: 'https://openrouter.ai/api/v1',
    cloudflare_account: '',
    ...overrides,
  } as any;
}

test('openrouter posts to /images and returns base64', async () => {
  const stub = stubFetch('{"data":[{"b64_json":"aGVsbG8="}]}');
  try {
    const result = await new ImageProvider(cfg({})).generate('a red panda');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]!.url, 'https://openrouter.ai/api/v1/images');
    assert.deepEqual(stub.calls[0]!.body, {
      model: 'bytedance-seed/seedream-4.5',
      prompt: 'a red panda',
    });
    assert.equal(result.b64_json, 'aGVsbG8=');
  } finally {
    stub.restore();
  }
});

test('openrouter honours an image base URL override', async () => {
  const stub = stubFetch('{"data":[{"url":"https://cdn.example/x.png"}]}');
  try {
    const result = await new ImageProvider(cfg({ image_url: 'https://proxy.example/v1/' })).generate('x');
    assert.equal(stub.calls[0]!.url, 'https://proxy.example/v1/images');
    assert.equal(result.url, 'https://cdn.example/x.png');
  } finally {
    stub.restore();
  }
});

test('openai still posts to /images/generations', async () => {
  const stub = stubFetch('{"data":[{"b64_json":"aGVsbG8="}]}');
  try {
    await new ImageProvider(
      cfg({ image_provider: 'openai', image_url: 'https://api.example/v1' }),
    ).generate('x');
    assert.equal(stub.calls[0]!.url, 'https://api.example/v1/images/generations');
  } finally {
    stub.restore();
  }
});
