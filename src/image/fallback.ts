// Port of src/ImageFallback.php
import { createHash } from 'node:crypto';
import type { Db } from '../db.js';
import type { Config } from '../config.js';
import { nowSec } from '../logger.js';
import { CloudflareQuotaExceeded, ImageProvider } from './provider.js';
import { GeminiImageProvider } from './geminiProvider.js';
import type { ImageResult } from '../types.js';

export class ImageFallback {
  constructor(
    private c: Config,
    private db: Db,
  ) {}

  static nextUtcDay(now: number): number {
    return (Math.floor(now / 86400) + 1) * 86400;
  }

  async generate(prompt: string): Promise<ImageResult> {
    const provider = this.c.image_provider;
    if (provider === 'gemini') {
      if (!this.c.gemini_image_key || !this.c.gemini_image_model) {
        throw new Error('Gemini image key or model is missing');
      }
      return new GeminiImageProvider(this.c.gemini_image_key, this.c.gemini_image_model).generate(prompt);
    }
    const scope = 'cloudflare:' + createHash('sha256').update(this.c.cloudflare_account).digest('hex');
    const row = this.db.prepare('SELECT blocked_until FROM image_provider_state WHERE provider=?').get(scope) as
      | { blocked_until: number }
      | undefined;
    const locked = provider === 'cloudflare' && Number(row?.blocked_until ?? 0) > nowSec();
    if (!locked) {
      try {
        return await new ImageProvider(this.c).generate(prompt);
      } catch (e) {
        if (e instanceof CloudflareQuotaExceeded) {
          this.db
            .prepare('INSERT INTO image_provider_state(provider,blocked_until) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET blocked_until=excluded.blocked_until')
            .run(scope, ImageFallback.nextUtcDay(nowSec()));
          console.error('[ahmad] image.cloudflare_quota_locked');
        } else {
          console.error(
            '[ahmad] image.primary_failed ' +
              JSON.stringify({ provider, error: e instanceof Error ? e.message : String(e) }),
          );
        }
      }
    } else {
      console.error('[ahmad] image.cloudflare_quota_lock_active');
    }
    if (!this.c.gemini_image_key || !this.c.gemini_image_model) {
      throw new Error('Image provider failed and Gemini fallback is not configured');
    }
    return new GeminiImageProvider(this.c.gemini_image_key, this.c.gemini_image_model).generate(prompt);
  }
}
