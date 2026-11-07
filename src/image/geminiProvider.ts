// Port of src/GeminiImageProvider.php
import type { ImageResult } from '../types.js';

export class GeminiImageProvider {
  constructor(
    private key: string,
    private model: string,
  ) {}

  async generate(prompt: string): Promise<ImageResult> {
    if (!/^[A-Za-z0-9._-]+$/.test(this.model)) throw new Error('Invalid Gemini image model');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      throw new Error('Gemini image request failed: ' + (e instanceof Error ? e.message : String(e)));
    }
    const raw = await res.text().catch(() => '');
    if (res.status >= 400) {
      let failure: any = null;
      try {
        failure = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const apiStatus =
        typeof failure?.error?.status === 'string'
          ? failure.error.status.replace(/[^A-Z_]/g, '')
          : '';
      const reasons: string[] = [];
      for (const d of failure?.error?.details ?? []) {
        if (d && typeof d.reason === 'string') reasons.push(d.reason.replace(/[^A-Z_]/g, ''));
      }
      throw new Error(
        `Gemini image request failed: HTTP ${res.status}` +
          (apiStatus ? ` status=${apiStatus}` : '') +
          (reasons.length ? ` reason=${reasons.join(',')}` : ''),
      );
    }
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Gemini did not return an image');
    }
    for (const part of data?.candidates?.[0]?.content?.parts ?? []) {
      const inline = part?.inlineData ?? part?.inline_data;
      if (inline && typeof inline === 'object' && inline.data) {
        return { b64_json: inline.data };
      }
    }
    throw new Error('Gemini did not return an image');
  }
}
