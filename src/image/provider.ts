// Port of src/ImageProvider.php
import type { Config } from '../config.js';
import type { ImageResult } from '../types.js';
import { sleep } from '../logger.js';

export class CloudflareQuotaExceeded extends Error {}

const RETRY_ERRNOS = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN']);

function isRetryableFetchError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return RETRY_ERRNOS.has((e as NodeJS.ErrnoException).code ?? '') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED');
}

export class ImageProvider {
  constructor(private c: Config) {}

  async generate(prompt: string): Promise<ImageResult> {
    const provider = this.c.image_provider;
    const model = this.c.image_model;
    const key = this.c.image_key;
    if (!model || !key) throw new Error('Image model or API key is missing');

    let url: string;
    let body: Record<string, unknown>;
    if (provider === 'cloudflare') {
      const account = this.c.cloudflare_account;
      if (!/^[a-f0-9]{32}$/i.test(account)) {
        throw new Error('Cloudflare account ID must be 32 hexadecimal characters');
      }
      if (!/^@[a-z0-9_-]+\/[a-z0-9._/-]+$/i.test(model)) {
        throw new Error('Invalid Cloudflare model ID');
      }
      const base = this.c.image_url || 'https://api.cloudflare.com/client/v4';
      url = `${base.replace(/\/+$/, '')}/accounts/${account}/ai/run/${model}`;
      body = { prompt };
    } else if (provider === 'openai') {
      url = `${this.c.image_url.replace(/\/+$/, '')}/images/generations`;
      body = { model, prompt };
    } else {
      throw new Error('Unknown image provider');
    }
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid image endpoint');
    }

    const multipart =
      provider === 'cloudflare' && (model.includes('/flux-2-klein-4b') || model.includes('/flux-2-dev'));
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (!multipart) headers['Content-Type'] = 'application/json';

    let res: Response | null = null;
    let raw = '';
    let status = 0;
    let contentType = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: multipart ? JSON.stringify(body) : JSON.stringify(body),
          signal: AbortSignal.timeout(120000),
        });
        status = res.status;
        contentType = res.headers.get('content-type') || '';
        raw = await res.text();
        break;
      } catch (e) {
        if (isRetryableFetchError(e) && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        throw e;
      }
    }

    if (provider === 'cloudflare' && status === 429 && raw) {
      let failure: any = null;
      try {
        failure = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      for (const item of failure?.errors ?? []) {
        if (Number(item?.code ?? 0) === 3036) throw new CloudflareQuotaExceeded('Cloudflare daily quota exhausted');
      }
    }
    if (status >= 400) throw new Error(`Image provider HTTP ${status}`);
    if (contentType.toLowerCase().startsWith('image/')) {
      return { b64_json: Buffer.from(raw, 'binary').toString('base64') };
    }
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('Image provider returned invalid data');
    }
    if (provider === 'cloudflare') {
      const image = json?.result?.image;
      if (typeof image === 'string' && image !== '') {
        try {
          new URL(image);
          return { url: image };
        } catch {
          return { b64_json: image };
        }
      }
      throw new Error('Cloudflare returned no image');
    }
    if (!json?.data?.[0] || typeof json.data[0] !== 'object') {
      throw new Error('Image provider returned no image');
    }
    return json.data[0] as ImageResult;
  }
}
