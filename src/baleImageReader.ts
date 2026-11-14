// Port of src/BaleImageReader.php — download ≤5MB, mime check, data URI,
// plus PV homework image downloader supporting up to 8 MB & all MyClass image formats.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_BATCH_BYTES = 20 * 1024 * 1024;

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'jfif',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'tif',
  'tiff',
  'heic',
  'heif',
]);

export interface DownloadedImage {
  buffer: Buffer;
  mime: string;
  filename: string;
}

export function validateBaleFilePath(p: string): void {
  if (
    p === '' ||
    p.includes('..') ||
    p.includes('\\') ||
    p.includes('://') ||
    p.startsWith('/') ||
    !/^[A-Za-z0-9_.:/=-]+$/.test(p)
  ) {
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

function mimeFromExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    default:
      return 'image/jpeg';
  }
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/avif':
      return 'avif';
    case 'image/tiff':
      return 'tiff';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'jpg';
  }
}

function isKnownNonImageBinary(buf: Buffer): boolean {
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return true;
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return true; // ZIP/DOCX/XLSX
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') return true;
  if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') return true;
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (['mp41', 'mp42', 'isom', 'm4a ', 'qt  '].includes(brand)) return true;
  }
  return false;
}

export function detectImageMime(buf: Buffer, filenameOrPath?: string): string | null {
  const core = sniffMime(buf);
  if (core) return core;

  if (buf.length >= 6) {
    const head6 = buf.toString('ascii', 0, 6);
    if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  }
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return 'image/bmp';
  }
  if (buf.length >= 4) {
    const isTiffLe = buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00;
    const isTiffBe = buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a;
    if (isTiffLe || isTiffBe) return 'image/tiff';
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
    if (['avif', 'avis'].includes(brand)) {
      return 'image/avif';
    }
  }

  if (isKnownNonImageBinary(buf)) {
    return null;
  }

  if (filenameOrPath) {
    const ext = path.extname(filenameOrPath).replace(/^\./, '').toLowerCase();
    if (ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return mimeFromExtension(ext);
    }
  }

  return null;
}

export function sanitizeImageFilename(rawName: string | undefined, mime: string, indexHint = 1): string {
  const base = rawName ? path.basename(rawName).trim() : '';
  const expectedExt = extensionForMime(mime);
  if (!base) {
    return `photo_${indexHint}.${expectedExt}`;
  }
  const ext = path.extname(base).replace(/^\./, '').toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return base;
  }
  const stem = base.replace(/\.+$/, '') || `photo_${indexHint}`;
  return `${stem}.${expectedExt}`;
}

export async function downloadBaleImage(
  token: string,
  filePath: string,
  originalName?: string,
  maxBytes = MAX_IMAGE_BYTES,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadedImage> {
  validateBaleFilePath(filePath);
  const url = `https://tapi.bale.ai/file/bot${token}/${filePath}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (res.status !== 200) {
    throw new Error('خطا در دریافت فایل از پیام‌رسان بله.');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error('فایل دریافت‌شده از پیام‌رسان بله خالی است.');
  }
  if (buf.length > maxBytes) {
    throw new Error('حجم تصویر بیش از حد مجاز است (حداکثر ۸ مگابایت برای هر تصویر).');
  }
  const mime = detectImageMime(buf, originalName ?? filePath);
  if (!mime) {
    throw new Error('فقط فایل‌های تصویری (عکس) مجاز است.');
  }
  return {
    buffer: buf,
    mime,
    filename: sanitizeImageFilename(originalName, mime),
  };
}

export class BaleImageReader {
  constructor(private token: string) {}

  async dataUri(filePath: string): Promise<string> {
    validateBaleFilePath(filePath);
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
