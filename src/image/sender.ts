// Port of src/ImageSender.php — URL as JSON, base64 via multipart Blob.
import { imageMime } from '../baleImageReader.js';
import type { ImageResult } from '../types.js';
import { sleep } from '../logger.js';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class ImageSender {
  constructor(private token: string) {}

  async send(chat: number, reply: number | null, image: ImageResult): Promise<void> {
    if (image.url) {
      try {
        const u = new URL(image.url);
        if (u.protocol === 'https:') {
          const payload: Record<string, unknown> = { chat_id: chat, photo: image.url };
          if (reply) payload.reply_to_message_id = reply;
          await this.requestJson(payload);
          return;
        }
      } catch {
        /* fall through to b64 */
      }
    }
    if (!image.b64_json) throw new Error('Image response contains no usable image');
    const bytes = Buffer.from(image.b64_json, 'base64');
    if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
      throw new Error('Image response contains no usable image');
    }
    const mime = imageMime(bytes);
    if (!mime || !(mime in MIME_EXT)) throw new Error('Unsupported image format');
    const form = new FormData();
    form.append('chat_id', String(chat));
    form.append('photo', new Blob([bytes], { type: mime }), `image.${MIME_EXT[mime]}`);
    if (reply) form.append('reply_to_message_id', String(reply));
    await this.requestMultipart(form);
  }

  private async requestJson(payload: Record<string, unknown>): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`https://tapi.bale.ai/bot${this.token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60000),
        });
        const text = await res.text().catch(() => '');
        if (res.status >= 400) throw new Error(`Bale image upload failed: HTTP ${res.status}`);
        let decoded: any = null;
        try {
          decoded = JSON.parse(text);
        } catch {
          /* ignore */
        }
        if (!decoded || !decoded.ok) throw new Error('Bale image upload was rejected');
        return;
      } catch (e) {
        if (attempt < 3 && isRetryable(e)) {
          await sleep(attempt * 2000);
          continue;
        }
        throw e;
      }
    }
  }

  private async requestMultipart(form: FormData): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`https://tapi.bale.ai/bot${this.token}/sendPhoto`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(60000),
        });
        const text = await res.text().catch(() => '');
        if (res.status >= 400) throw new Error(`Bale image upload failed: HTTP ${res.status}`);
        let decoded: any = null;
        try {
          decoded = JSON.parse(text);
        } catch {
          /* ignore */
        }
        if (!decoded || !decoded.ok) throw new Error('Bale image upload was rejected');
        return;
      } catch (e) {
        if (attempt < 3 && isRetryable(e)) {
          await sleep(attempt * 2000);
          continue;
        }
        throw e;
      }
    }
  }
}

function isRetryable(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as NodeJS.ErrnoException).code;
  return ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(code ?? '') || e.name === 'AbortError';
}
