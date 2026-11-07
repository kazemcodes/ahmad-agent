// Port of src/BaleImageReader.php — download ≤5MB, mime check, data URI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function validatePath(p: string): void {
  if (p === '' || p.includes('..') || p.startsWith('/') || !/^[A-Za-z0-9_./-]+$/.test(p)) {
    throw new Error('Invalid Bale file path');
  }
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export class BaleImageReader {
  constructor(private token: string) {}

  async dataUri(filePath: string): Promise<string> {
    validatePath(filePath);
    const url = `https://tapi.bale.ai/file/bot${this.token}/${filePath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (res.status !== 200) throw new Error('Could not download image or image exceeds 5 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) throw new Error('Could not download image or image exceeds 5 MB');
    const mime = sniffMime(buf);
    if (!mime) throw new Error('Unsupported image type');
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
}

export { sniffMime };

// Helper for ImageSender: sniff mime of an in-memory image buffer.
export function imageMime(buf: Buffer): string | null {
  return sniffMime(buf);
}

export async function writeTempFile(prefix: string, bytes: Buffer): Promise<string> {
  const dir = os.tmpdir();
  const p = path.join(dir, `${prefix}${Date.now()}_${Math.random().toString(36).slice(2)}`);
  await fs.promises.writeFile(p, bytes);
  return p;
}
