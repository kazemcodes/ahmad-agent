// Port of src/VoiceTranscriber.php
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBaleFilePath } from './baleImageReader.js';

export class VoiceTranscriber {
  constructor(
    private token: string,
    private baseUrl: string,
    private key: string,
    private model: string,
  ) {}

  async transcribe(filePath: string): Promise<string> {
    validateBaleFilePath(filePath);
    const url = `https://tapi.bale.ai/file/bot${this.token}/${filePath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (res.status !== 200) throw new Error('Voice download failed or is not Ogg');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) throw new Error('Voice download failed or is not Ogg');
    if (!buf.subarray(0, 4).toString('ascii').startsWith('OggS')) {
      throw new Error('Voice download failed or is not Ogg');
    }
    const tmp = path.join(os.tmpdir(), `ahmad_audio_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);
    try {
      await fs.promises.writeFile(tmp, buf);
      const form = new FormData();
      form.append('model', this.model);
      form.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
      const tRes = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}` },
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      if (tRes.status >= 400) throw new Error(`Transcription failed: HTTP ${tRes.status}`);
      const result: any = await tRes.json().catch(() => null);
      const text = result?.text ?? '';
      if (typeof text !== 'string' || text.trim() === '') throw new Error('Empty transcription');
      return text.trim();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}
