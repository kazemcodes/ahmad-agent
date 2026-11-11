import path from 'node:path';
import type { ChatContext, Deps, UseCase } from '../context.js';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  downloadBaleImage,
  MAX_BATCH_BYTES,
  MAX_IMAGE_BYTES,
  type DownloadedImage,
} from '../baleImageReader.js';
import {
  MyClassClient,
  type MyClassClientLike,
  type MyClassHomeworkItem,
  type MyClassOpenPeriod,
  type MyClassStudentMatch,
} from '../myclassClient.js';
import { PvRepo, type BaleStudentLink } from '../pvRepo.js';
import { nowSec } from '../logger.js';
import { substr, ymd } from '../util.js';

export const BTN_ATTENDANCE = '✅ ثبت حضور';
export const BTN_HOMEWORK = '📚 ارسال تکلیف';
export const BTN_HELP = 'ℹ️ راهنما';
export const BTN_SWITCH = '🔄 تغییر کد ملی / کلاس';
export const BTN_FINALIZE = '✅ ثبت نهایی';
export const BTN_CANCEL = '❌ انصراف';

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: BTN_ATTENDANCE }, { text: BTN_HOMEWORK }],
    [{ text: BTN_HELP }, { text: BTN_SWITCH }],
  ],
  resize_keyboard: true,
};

export const UPLOAD_KEYBOARD = {
  keyboard: [[{ text: BTN_FINALIZE }, { text: BTN_CANCEL }]],
  resize_keyboard: true,
};

export const CANCEL_KEYBOARD = {
  keyboard: [[{ text: BTN_CANCEL }, { text: BTN_HELP }]],
  resize_keyboard: true,
};

export const UNLINKED_KEYBOARD = {
  keyboard: [[{ text: BTN_HELP }]],
  resize_keyboard: true,
};

interface ChoosingClassPayload {
  national_code: string;
  students: MyClassStudentMatch[];
}

interface ChoosingAttendancePayload {
  periods: MyClassOpenPeriod[];
}

interface ChoosingHomeworkPayload {
  homeworks: MyClassHomeworkItem[];
}

interface StagedFileItem {
  file_id: string;
  file_name: string;
  file_size?: number | undefined;
  caption?: string | undefined;
  is_document: boolean;
}

interface UploadingHomeworkPayload {
  homework_id: number;
  homework_title: string;
  already_submitted: boolean;
  submitted_files_count: number;
  score: number | null;
  files: StagedFileItem[];
}

export interface PrivateMyClassOptions {
  makeClient?: (deps: Deps) => MyClassClientLike;
  downloadImage?: typeof downloadBaleImage;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toAsciiDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

function cleanDigits(input: string): string {
  return toAsciiDigits(input).replace(/\D+/g, '');
}

function normalizeNationalCodeInput(input: string): string {
  const digits = cleanDigits(input);
  if (digits.length >= 8 && digits.length <= 10) {
    return digits.padStart(10, '0');
  }
  return digits;
}

function looksLikeNationalCodeInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/^[\s\-_۰-۹٠-٩0-9]+$/.test(trimmed)) return false;
  return cleanDigits(trimmed).length > 0;
}

function parseNonNegativeInt(input: string): number | null {
  const ascii = toAsciiDigits(input).trim();
  if (!/^\d+$/.test(ascii)) return null;
  return Number.parseInt(ascii, 10);
}

function normalizeLabel(input: string): string {
  return toAsciiDigits(input)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesAction(text: string, candidates: string[]): boolean {
  const norm = normalizeLabel(text);
  if (!norm) return false;
  return candidates.some((c) => normalizeLabel(c) === norm);
}

const isHelpCmd = (t: string) => matchesAction(t, [BTN_HELP, 'راهنما', 'کمک', '/start', '/help']);
const isCancelCmd = (t: string) => matchesAction(t, [BTN_CANCEL, 'انصراف', '/cancel', 'بازگشت', 'لغو']);
const isAttendanceCmd = (t: string) => matchesAction(t, [BTN_ATTENDANCE, 'ثبت حضور', 'حضور', '/attendance']);
const isHomeworkCmd = (t: string) => matchesAction(t, [BTN_HOMEWORK, 'ارسال تکلیف', 'تکلیف', 'تکالیف', '/homework']);
const isSwitchCmd = (t: string) =>
  matchesAction(t, [BTN_SWITCH, 'تغییر کد ملی / کلاس', 'تغییر کد ملی', 'تغییر کلاس', 'خروج', '/switch']);
const isFinalizeCmd = (t: string) => matchesAction(t, [BTN_FINALIZE, 'ثبت نهایی', 'تمام', 'ارسال نهایی', '/done']);

function isImageDocument(doc: { file_name?: string; mime_type?: unknown }): boolean {
  const mime = typeof doc.mime_type === 'string' ? doc.mime_type.toLowerCase().trim() : '';
  if (mime.startsWith('image/')) return true;
  if (mime !== '' && mime !== 'application/octet-stream') return false;
  const ext = path.extname(doc.file_name ?? '').replace(/^\./, '').toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function formatTeacherLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return /^(استاد|دکتر|مهندس|خانم|آقای)\s/u.test(trimmed) ? trimmed : `استاد ${trimmed}`;
}

function formatClassNameLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return /^کلاس\s/u.test(trimmed) ? trimmed : `کلاس ${trimmed}`;
}

function formatClassLine(idx: number, s: MyClassStudentMatch, currentStudentId?: number): string {
  const parts = [formatTeacherLabel(s.teacher_name), s.school_name, s.class_name].filter(Boolean);
  const label = parts.length > 0 ? parts.join(' | ') : `کلاس #${s.student_id}`;
  const currentTag = currentStudentId !== undefined && s.student_id === currentStudentId ? ' (کلاس فعلی)' : '';
  return `${idx}. ${label}${currentTag}`;
}

function formatStudentCard(link: {
  full_name: string;
  teacher_name: string | null;
  school_name: string | null;
  class_name: string | null;
}): string {
  const details = [
    formatTeacherLabel(link.teacher_name),
    link.school_name,
    formatClassNameLabel(link.class_name),
  ].filter(Boolean);
  return details.length > 0 ? `👤 ${link.full_name}\n🏫 ${details.join(' | ')}` : `👤 ${link.full_name}`;
}

function linkedHelpText(link: BaleStudentLink): string {
  return [
    formatStudentCard(link),
    '',
    '📌 راهنمای کار با ربات:',
    `1️⃣ ${BTN_ATTENDANCE}: ثبت حضور شما در زنگ فعال کلاس (طبق ساعت تعریف‌شده استاد در سایت)`,
    `2️⃣ ${BTN_HOMEWORK}: مشاهده آخرین تکالیف باز، انتخاب شماره تکلیف، ارسال ۱ تا ۱۰ عکس و زدن «${BTN_FINALIZE}»`,
    `3️⃣ ${BTN_SWITCH}: تغییر کلاس (اگر در چند کلاس عضو هستید) یا اتصال با کد ملی دیگر`,
    '',
    'لطفاً یکی از دکمه‌های منوی پایین را انتخاب کنید.',
  ].join('\n');
}

function unlinkedHelpText(): string {
  return [
    'سلام! به ربات دانش‌آموزی «کلاس من» خوش آمدید 👋',
    'در پیام خصوصی، ارتباط مستقیم شما با سایت برقرار است و می‌توانید:',
    '✅ حضور کلاسی خود را مستقیم در سایت ثبت کنید',
    '📚 آخرین تکالیف باز را ببینید و عکس پاسخ خود را به سایت بفرستید',
    '',
    '🔑 برای شروع، کد ملی ۱۰ رقمی خود را بفرستید (مثلاً 0012345678):',
  ].join('\n');
}

function formatHomeworkEntry(idx: number, hw: MyClassHomeworkItem): string {
  const subjectText = hw.subject || 'عمومی';
  const deadlineText = hw.due_date
    ? `${hw.due_date}${hw.due_time ? ` ساعت ${hw.due_time}` : ''}`
    : 'بدون مهلت';

  let statusText = '⏳ ارسال نشده';
  if (hw.submitted) {
    statusText = `✅ ارسال شده (${hw.submitted_files_count} فایل)`;
    if (hw.score !== null) {
      statusText += ` | نمره: ${hw.score}`;
    }
  }

  return `${idx}. ${hw.title}\n   📘 درس: ${subjectText} | ⏰ مهلت: ${deadlineText}\n   📌 وضعیت: ${statusText}`;
}

async function sendHomeworksList(
  chat: number,
  homeworks: MyClassHomeworkItem[],
  deps: Deps,
): Promise<void> {
  const header = '📚 فهرست تکالیف فعال (از جدیدترین):\n';
  const footer = `\nشماره تکلیف مورد نظر (۱ تا ${homeworks.length}) را برای ارسال عکس بفرستید:`;
  const MAX_CHUNK_CHARS = 3600;

  const chunks: string[] = [];
  let current = header;

  for (let i = 0; i < homeworks.length; i++) {
    const hw = homeworks[i];
    if (!hw) continue;
    const entry = formatHomeworkEntry(i + 1, hw);
    const addition = (current === header ? '' : '\n\n') + entry;
    if (current.length + addition.length > MAX_CHUNK_CHARS && current !== header) {
      chunks.push(current);
      current = entry;
    } else {
      current += addition;
    }
  }
  chunks.push(current);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === undefined) continue;
    const isLast = i === chunks.length - 1;
    const text = isLast ? `${chunk}\n${footer}` : chunk;
    await deps.send(chat, text, null, isLast ? CANCEL_KEYBOARD : undefined);
  }
}

export function createPrivateMyClass(options: PrivateMyClassOptions = {}): UseCase {
  const makeClient =
    options.makeClient ??
    ((deps: Deps) =>
      new MyClassClient(
        deps.config.myclass_api_url,
        deps.config.myclass_bot_token,
        deps.config.myclass_timeout_ms || 90000,
      ));
  const downloadImg = options.downloadImage ?? downloadBaleImage;

  return async (ctx: ChatContext, deps: Deps): Promise<boolean> => {
    if ((ctx.msg.chat?.type ?? '') !== 'private') {
      return false;
    }

    // Ignore edited messages in PV so edits do not duplicate uploads or trigger AI/writes.
    if (ctx.update.edited_message) {
      return true;
    }

    const repo = new PvRepo(deps.db);
    const client = makeClient(deps);

    const unlinkAndPrompt = async (message: string): Promise<void> => {
      repo.deleteLink(ctx.user);
      repo.clearState(ctx.user);
      await deps.send(ctx.chat, message, ctx.mid, UNLINKED_KEYBOARD);
    };

    const link = repo.getLink(ctx.user);
    const stateRow = repo.getState(ctx.user);
    const currentState = stateRow?.state ?? 'menu';

    // ── 1. Active upload staging state (`uploading_homework`) ──────────
    if (link && currentState === 'uploading_homework' && stateRow?.payload) {
      const staged = stateRow.payload as unknown as UploadingHomeworkPayload;

      if (isCancelCmd(ctx.text)) {
        repo.setState(ctx.user, 'menu', null);
        await deps.send(
          ctx.chat,
          `❌ ارسال تکلیف «${staged.homework_title}» لغو شد و عکس‌های آماده پاک شدند.`,
          ctx.mid,
          MAIN_KEYBOARD,
        );
        return true;
      }

      if (isHelpCmd(ctx.text)) {
        await deps.send(
          ctx.chat,
          `📌 در حال ارسال پاسخ برای تکلیف «${staged.homework_title}» هستید.\n` +
            `تعداد عکس‌های آماده تا اینجا: ${staged.files.length} از ۱۰.\n` +
            `عکس بعدی را بفرستید، برای ثبت در سایت «${BTN_FINALIZE}» را بزنید یا برای بازگشت «${BTN_CANCEL}» را انتخاب کنید.`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );
        return true;
      }

      if (isFinalizeCmd(ctx.text)) {
        if (!staged.files || staged.files.length === 0) {
          await deps.send(
            ctx.chat,
            `هنوز هیچ عکسی نفرستاده‌اید. لطفاً حداقل یک عکس بفرستید یا «${BTN_CANCEL}» را بزنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        await deps.send(
          ctx.chat,
          `⏳ در حال دریافت و ارسال ${staged.files.length} عکس به سایت…`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );

        const downloaded: DownloadedImage[] = [];
        let totalBytes = 0;

        try {
          for (const item of staged.files) {
            const gf = await deps.bale.getFile(item.file_id);
            const filePath = typeof gf?.result?.file_path === 'string' ? gf.result.file_path : '';
            if (!filePath) {
              throw new Error('آدرس یکی از فایل‌ها از پیام‌رسان بله دریافت نشد.');
            }
            const img = await downloadImg(
              deps.config.bale_token,
              filePath,
              item.file_name,
              MAX_IMAGE_BYTES,
            );
            totalBytes += img.buffer.length;
            if (totalBytes > MAX_BATCH_BYTES) {
              await deps.send(
                ctx.chat,
                `❌ مجموع حجم واقعی عکس‌های ارسالی بیشتر از سقف مجاز ۲۰ مگابایت است. لطفاً عکس‌های کم‌حجم‌تری انتخاب کنید یا «${BTN_CANCEL}» را بزنید.`,
                ctx.mid,
                UPLOAD_KEYBOARD,
              );
              return true;
            }
            downloaded.push(img);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'خطا در دریافت فایل از پیام‌رسان بله.';
          await deps.send(
            ctx.chat,
            `❌ ${msg}\nعکس‌های شما همچنان آماده است؛ می‌توانید دوباره «${BTN_FINALIZE}» را بزنید یا «${BTN_CANCEL}» کنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        const rawNotes = staged.files
          .map((f) => f.caption?.trim() ?? '')
          .filter(Boolean)
          .join('\n');
        const note = rawNotes !== '' ? substr(rawNotes, 1000) : undefined;

        const submitRes = await client.submitHomework(
          staged.homework_id,
          link.student_id,
          link.national_code,
          downloaded,
          note,
        );

        if (submitRes.ok) {
          repo.setState(ctx.user, 'menu', null);
          deps.log('pv.homework.submitted', {
            user_id: ctx.user,
            student_id: link.student_id,
            homework_id: staged.homework_id,
            files_count: submitRes.submission.files_count,
          });
          await deps.send(
            ctx.chat,
            `✅ تکلیف «${staged.homework_title}» با ${submitRes.submission.files_count} عکس با موفقیت در سایت ثبت شد.\n${submitRes.message}`,
            ctx.mid,
            MAIN_KEYBOARD,
          );
          return true;
        }

        if (submitRes.code === 'student_not_found') {
          await unlinkAndPrompt(`⚠️ ${submitRes.message}\nکد ملی ۱۰ رقمی خود را دوباره بفرستید:`);
          return true;
        }

        if (
          submitRes.code === 'homework_expired' ||
          submitRes.code === 'homework_not_found' ||
          submitRes.code === 'forbidden'
        ) {
          repo.setState(ctx.user, 'menu', null);
          await deps.send(ctx.chat, `❌ ${submitRes.message}`, ctx.mid, MAIN_KEYBOARD);
          return true;
        }

        // Preserve staged photos on transient/network or server error so user can retry safely
        await deps.send(
          ctx.chat,
          `❌ ${submitRes.message}\nعکس‌های شما حفظ شده است؛ می‌توانید دوباره «${BTN_FINALIZE}» را بزنید یا «${BTN_CANCEL}» کنید.`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );
        return true;
      }

      // Stage incoming Bale photo (pick largest PhotoSize)
      if (Array.isArray(ctx.msg.photo) && ctx.msg.photo.length > 0) {
        const largest = ctx.msg.photo[ctx.msg.photo.length - 1];
        if (!largest) {
          await deps.send(ctx.chat, '❌ شناسه عکس معتبر نیست؛ لطفاً دوباره بفرستید.', ctx.mid, UPLOAD_KEYBOARD);
          return true;
        }
        const fileId = largest.file_id ? String(largest.file_id) : '';
        if (!fileId) {
          await deps.send(ctx.chat, '❌ شناسه عکس معتبر نیست؛ لطفاً دوباره بفرستید.', ctx.mid, UPLOAD_KEYBOARD);
          return true;
        }

        if (staged.files.length >= 10) {
          await deps.send(
            ctx.chat,
            `⚠️ حداکثر ۱۰ عکس می‌توانید در هر تکلیف بفرستید. لطفاً «${BTN_FINALIZE}» یا «${BTN_CANCEL}» را بزنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        const size = typeof largest.file_size === 'number' ? largest.file_size : undefined;
        if (size !== undefined && size > MAX_IMAGE_BYTES) {
          await deps.send(
            ctx.chat,
            '❌ حجم این عکس بیشتر از ۸ مگابایت است. لطفاً عکس کم‌حجم‌تری بفرستید.',
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        const currentKnownBytes = staged.files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
        if (size !== undefined && currentKnownBytes + size > MAX_BATCH_BYTES) {
          await deps.send(
            ctx.chat,
            `⚠️ با اضافه شدن این عکس، حجم کل بیش از ۲۰ مگابایت می‌شود. می‌توانید عکس‌های فعلی را با «${BTN_FINALIZE}» بفرستید یا «${BTN_CANCEL}» کنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        staged.files.push({
          file_id: fileId,
          file_name: `photo_${staged.files.length + 1}.jpg`,
          file_size: size,
          caption: typeof ctx.msg.caption === 'string' && ctx.msg.caption.trim() !== '' ? ctx.msg.caption.trim() : undefined,
          is_document: false,
        });
        repo.setState(ctx.user, 'uploading_homework', staged);

        await deps.send(
          ctx.chat,
          `📸 عکس شماره ${staged.files.length} دریافت شد.\nمی‌توانید عکس بعدی را بفرستید (حداکثر ۱۰ عکس) یا دکمه «${BTN_FINALIZE}» را بزنید.`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );
        return true;
      }

      // Stage incoming image document (e.g. uncompressed image sent as file), reject non-images like PDF
      if (ctx.msg.document && ctx.msg.document.file_id) {
        const doc = ctx.msg.document;
        if (!isImageDocument(doc)) {
          await deps.send(
            ctx.chat,
            '❌ در حال حاضر سایت فقط فایل‌های تصویری (عکس) را می‌پذیرد؛ لطفاً تکلیف را به‌صورت عکس ارسال کنید.',
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        if (staged.files.length >= 10) {
          await deps.send(
            ctx.chat,
            `⚠️ حداکثر ۱۰ عکس می‌توانید در هر تکلیف بفرستید. لطفاً «${BTN_FINALIZE}» یا «${BTN_CANCEL}» را بزنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        const size = typeof doc.file_size === 'number' ? doc.file_size : undefined;
        if (size !== undefined && size > MAX_IMAGE_BYTES) {
          await deps.send(
            ctx.chat,
            '❌ حجم این تصویر بیشتر از ۸ مگابایت است. لطفاً تصویر کم‌حجم‌تری بفرستید.',
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        const currentKnownBytes = staged.files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
        if (size !== undefined && currentKnownBytes + size > MAX_BATCH_BYTES) {
          await deps.send(
            ctx.chat,
            `⚠️ با اضافه شدن این تصویر، حجم کل بیش از ۲۰ مگابایت می‌شود. می‌توانید فایل‌های فعلی را با «${BTN_FINALIZE}» بفرستید یا «${BTN_CANCEL}» کنید.`,
            ctx.mid,
            UPLOAD_KEYBOARD,
          );
          return true;
        }

        staged.files.push({
          file_id: String(doc.file_id),
          file_name: doc.file_name ? String(doc.file_name) : `image_${staged.files.length + 1}.jpg`,
          file_size: size,
          caption: typeof ctx.msg.caption === 'string' && ctx.msg.caption.trim() !== '' ? ctx.msg.caption.trim() : undefined,
          is_document: true,
        });
        repo.setState(ctx.user, 'uploading_homework', staged);

        await deps.send(
          ctx.chat,
          `📸 عکس شماره ${staged.files.length} دریافت شد.\nمی‌توانید عکس بعدی را بفرستید (حداکثر ۱۰ عکس) یا دکمه «${BTN_FINALIZE}» را بزنید.`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );
        return true;
      }

      if (ctx.msg.voice || ctx.msg.sticker || ctx.msg.video || ctx.msg.audio) {
        await deps.send(
          ctx.chat,
          `⚠️ برای ارسال تکلیف فقط ارسال عکس مجاز است. لطفاً عکس پاسخ را بفرستید یا «${BTN_FINALIZE}» / «${BTN_CANCEL}» را بزنید.`,
          ctx.mid,
          UPLOAD_KEYBOARD,
        );
        return true;
      }

      await deps.send(
        ctx.chat,
        `📌 شما هم‌اکنون در حال ارسال عکس برای تکلیف «${staged.homework_title}» هستید (${staged.files.length} عکس آماده).\n` +
          `لطفاً عکس دیگری بفرستید، دکمه «${BTN_FINALIZE}» را بزنید یا ابتدا با «${BTN_CANCEL}» از ارسال این تکلیف خارج شوید.`,
        ctx.mid,
        UPLOAD_KEYBOARD,
      );
      return true;
    }

    // ── 2. Lookup / Class-Selection Helper ───────────────────────────
    const handleNationalCodeLookup = async (rawCode: string, allowCancelKeyboard = false): Promise<void> => {
      const normalized = normalizeNationalCodeInput(rawCode);
      const res = await client.lookupNationalCode(normalized, ctx.user);

      if (!res.ok) {
        await deps.send(
          ctx.chat,
          `❌ ${res.message}`,
          ctx.mid,
          allowCancelKeyboard ? CANCEL_KEYBOARD : UNLINKED_KEYBOARD,
        );
        return;
      }

      const singleStudent = res.students.length === 1 ? res.students[0] : undefined;
      if (singleStudent) {
        const s = singleStudent;
        repo.upsertLink({
          user_id: ctx.user,
          national_code: res.national_code,
          student_id: s.student_id,
          full_name: s.full_name,
          teacher_name: s.teacher_name,
          school_name: s.school_name,
          class_name: s.class_name,
        });
        repo.setState(ctx.user, 'menu', null);
        deps.log('pv.linked', { user_id: ctx.user, student_id: s.student_id });
        const saved = repo.getLink(ctx.user)!;
        await deps.send(
          ctx.chat,
          `✅ اتصال شما با موفقیت انجام شد!\n\n${formatStudentCard(saved)}\n\nاز منوی پایین گزینه مورد نظر را انتخاب کنید:`,
          ctx.mid,
          MAIN_KEYBOARD,
        );
        return;
      }

      repo.setState(ctx.user, 'choosing_class', {
        national_code: res.national_code,
        students: res.students,
      } satisfies ChoosingClassPayload);

      const lines = res.students.map((s, idx) => formatClassLine(idx + 1, s));
      await deps.send(
        ctx.chat,
        `این کد ملی در چند کلاس ثبت شده است؛ لطفاً شماره کلاس مورد نظر را بفرستید:\n\n${lines.join('\n')}`,
        ctx.mid,
        CANCEL_KEYBOARD,
      );
    };

    // ── 3. Unlinked State ────────────────────────────────────────────
    if (!link) {
      if (currentState === 'choosing_class' && stateRow?.payload) {
        const payload = stateRow.payload as unknown as ChoosingClassPayload;

        if (isCancelCmd(ctx.text)) {
          repo.clearState(ctx.user);
          await deps.send(ctx.chat, unlinkedHelpText(), ctx.mid, UNLINKED_KEYBOARD);
          return true;
        }

        const choice = parseNonNegativeInt(ctx.text);
        const picked = choice !== null && choice >= 1 ? payload.students[choice - 1] : undefined;
        if (picked) {
          repo.upsertLink({
            user_id: ctx.user,
            national_code: payload.national_code,
            student_id: picked.student_id,
            full_name: picked.full_name,
            teacher_name: picked.teacher_name,
            school_name: picked.school_name,
            class_name: picked.class_name,
          });
          repo.setState(ctx.user, 'menu', null);
          deps.log('pv.linked', { user_id: ctx.user, student_id: picked.student_id });
          const saved = repo.getLink(ctx.user)!;
          await deps.send(
            ctx.chat,
            `✅ اتصال به کلاس انجام شد!\n\n${formatStudentCard(saved)}\n\nاز منوی پایین گزینه مورد نظر را انتخاب کنید:`,
            ctx.mid,
            MAIN_KEYBOARD,
          );
          return true;
        }

        const lines = payload.students.map((s, idx) => formatClassLine(idx + 1, s));
        await deps.send(
          ctx.chat,
          `لطفاً یک عدد بین ۱ تا ${payload.students.length} ارسال کنید (یا «${BTN_CANCEL}» را بزنید):\n\n${lines.join('\n')}`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }

      if (isHelpCmd(ctx.text)) {
        await deps.send(ctx.chat, unlinkedHelpText(), ctx.mid, UNLINKED_KEYBOARD);
        return true;
      }

      if (ctx.msg.photo || ctx.msg.document || ctx.msg.voice || ctx.msg.sticker || ctx.msg.video) {
        await deps.send(
          ctx.chat,
          'ابتدا باید با کد ملی خود به کلاس متصل شوید. لطفاً کد ملی ۱۰ رقمی خود را بفرستید:',
          ctx.mid,
          UNLINKED_KEYBOARD,
        );
        return true;
      }

      if (looksLikeNationalCodeInput(ctx.text)) {
        await handleNationalCodeLookup(ctx.text, false);
        return true;
      }

      await deps.send(
        ctx.chat,
        'برای اتصال به حساب دانش‌آموزی خود، کد ملی ۱۰ رقمی خود را بفرستید (یا «ℹ️ راهنما» را بزنید).',
        ctx.mid,
        UNLINKED_KEYBOARD,
      );
      return true;
    }

    // ── 4. Linked User Global Menu Commands ──────────────────────────
    if (isHelpCmd(ctx.text)) {
      repo.setState(ctx.user, 'menu', null);
      await deps.send(ctx.chat, linkedHelpText(link), ctx.mid, MAIN_KEYBOARD);
      return true;
    }

    if (isCancelCmd(ctx.text)) {
      repo.setState(ctx.user, 'menu', null);
      await deps.send(ctx.chat, 'به منوی اصلی بازگشتید.', ctx.mid, MAIN_KEYBOARD);
      return true;
    }

    if (isSwitchCmd(ctx.text)) {
      const lookup = await client.lookupNationalCode(link.national_code, ctx.user);

      if (!lookup.ok && lookup.code === 'student_not_found') {
        await unlinkAndPrompt(`⚠️ ${lookup.message}\nلطفاً کد ملی ۱۰ رقمی خود را بفرستید:`);
        return true;
      }

      if (lookup.ok && lookup.students.length > 1) {
        repo.setState(ctx.user, 'choosing_switch_target', {
          national_code: lookup.national_code,
          students: lookup.students,
        } satisfies ChoosingClassPayload);

        const lines = lookup.students.map((s, idx) => formatClassLine(idx + 1, s, link.student_id));
        await deps.send(
          ctx.chat,
          `شماره کلاس مورد نظر را برای جابه‌جایی بفرستید یا عدد 0 را برای وارد کردن کد ملی جدید ارسال کنید:\n\n0. وارد کردن کد ملی جدید\n${lines.join('\n')}`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }

      repo.setState(ctx.user, 'awaiting_new_national_code', null);
      await deps.send(
        ctx.chat,
        `لطفاً کد ملی ۱۰ رقمی جدید را ارسال کنید (یا برای بازگشت «${BTN_CANCEL}» را بزنید):`,
        ctx.mid,
        CANCEL_KEYBOARD,
      );
      return true;
    }

    if (isAttendanceCmd(ctx.text)) {
      repo.setState(ctx.user, 'menu', null);
      const res = await client.checkInAttendance(link.student_id, link.national_code, ctx.user);

      if (!res.ok) {
        if (res.code === 'student_not_found') {
          await unlinkAndPrompt(`⚠️ ${res.message}\nلطفاً دوباره کد ملی ۱۰ رقمی خود را بفرستید:`);
          return true;
        }
        await deps.send(ctx.chat, `⚠️ ${res.message}`, ctx.mid, MAIN_KEYBOARD);
        return true;
      }

      if (res.needs_selection && res.open_periods && res.open_periods.length > 0) {
        repo.setState(ctx.user, 'choosing_attendance_period', {
          periods: res.open_periods,
        } satisfies ChoosingAttendancePayload);
        const lines = res.open_periods.map((p, idx) => {
          const until = p.is_quick_open && p.quick_open_until ? p.quick_open_until : p.cutoff_time;
          return `${idx + 1}. ${p.title} (مهلت تا ${until})`;
        });
        await deps.send(
          ctx.chat,
          `${res.message}\n\n${lines.join('\n')}\n\nشماره زنگ را بفرستید:`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }

      if (res.attendance) {
        repo.upsertAttendanceLog({
          user_id: ctx.user,
          student_id: link.student_id,
          national_code: link.national_code,
          date: res.attendance.date || ymd(nowSec()),
          period_number: res.attendance.period,
          period_title: res.attendance.title,
          status: res.attendance.status || 'present',
        });
      }

      const replyText = res.already_checked_in
        ? `ℹ️ ${res.message}`
        : `✅ ${res.message}\n(در سایت و ربات ثبت شد)`;
      await deps.send(ctx.chat, replyText, ctx.mid, MAIN_KEYBOARD);
      return true;
    }

    if (isHomeworkCmd(ctx.text)) {
      repo.setState(ctx.user, 'menu', null);
      const res = await client.listHomeworks(link.student_id, link.national_code);

      if (!res.ok) {
        if (res.code === 'student_not_found') {
          await unlinkAndPrompt(`⚠️ ${res.message}\nلطفاً دوباره کد ملی ۱۰ رقمی خود را بفرستید:`);
          return true;
        }
        await deps.send(ctx.chat, `⚠️ ${res.message}`, ctx.mid, MAIN_KEYBOARD);
        return true;
      }

      if (!res.homeworks || res.homeworks.length === 0) {
        await deps.send(
          ctx.chat,
          'در حال حاضر تکلیف فعالی (دارای مهلت) برای شما ثبت نشده است.',
          ctx.mid,
          MAIN_KEYBOARD,
        );
        return true;
      }

      repo.setState(ctx.user, 'choosing_homework', {
        homeworks: res.homeworks,
      } satisfies ChoosingHomeworkPayload);

      await sendHomeworksList(ctx.chat, res.homeworks, deps);
      return true;
    }

    // ── 5. Linked Non-Upload Interactive States ──────────────────────
    if (currentState === 'choosing_switch_target' && stateRow?.payload) {
      const payload = stateRow.payload as unknown as ChoosingClassPayload;
      const choice = parseNonNegativeInt(ctx.text);

      if (choice === 0) {
        repo.setState(ctx.user, 'awaiting_new_national_code', null);
        await deps.send(
          ctx.chat,
          `لطفاً کد ملی ۱۰ رقمی جدید را ارسال کنید (یا برای بازگشت «${BTN_CANCEL}» را بزنید):`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }

      const picked = choice !== null && choice >= 1 ? payload.students[choice - 1] : undefined;
      if (picked) {
        repo.upsertLink({
          user_id: ctx.user,
          national_code: payload.national_code,
          student_id: picked.student_id,
          full_name: picked.full_name,
          teacher_name: picked.teacher_name,
          school_name: picked.school_name,
          class_name: picked.class_name,
        });
        repo.setState(ctx.user, 'menu', null);
        const saved = repo.getLink(ctx.user)!;
        await deps.send(
          ctx.chat,
          `✅ کلاس فعال شما تغییر کرد:\n\n${formatStudentCard(saved)}`,
          ctx.mid,
          MAIN_KEYBOARD,
        );
        return true;
      }

      await deps.send(
        ctx.chat,
        `لطفاً عددی بین 0 تا ${payload.students.length} ارسال کنید یا «${BTN_CANCEL}» را بزنید.`,
        ctx.mid,
        CANCEL_KEYBOARD,
      );
      return true;
    }

    if (currentState === 'awaiting_new_national_code') {
      if (!looksLikeNationalCodeInput(ctx.text)) {
        await deps.send(
          ctx.chat,
          `لطفاً کد ملی ۱۰ رقمی جدید را بفرستید یا «${BTN_CANCEL}» را بزنید.`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }
      await handleNationalCodeLookup(ctx.text, true);
      return true;
    }

    if (currentState === 'choosing_attendance_period' && stateRow?.payload) {
      const payload = stateRow.payload as unknown as ChoosingAttendancePayload;
      const choice = parseNonNegativeInt(ctx.text);
      const selectedPeriod = choice !== null && choice >= 1 ? payload.periods[choice - 1] : undefined;

      if (!selectedPeriod) {
        await deps.send(
          ctx.chat,
          `لطفاً شماره زنگ را بین ۱ تا ${payload.periods.length} ارسال کنید (یا «${BTN_CANCEL}» را بزنید).`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }
      const res = await client.checkInAttendance(
        link.student_id,
        link.national_code,
        ctx.user,
        selectedPeriod.period,
      );

      if (!res.ok) {
        if (res.code === 'student_not_found') {
          await unlinkAndPrompt(`⚠️ ${res.message}\nلطفاً دوباره کد ملی ۱۰ رقمی خود را بفرستید:`);
          return true;
        }
        repo.setState(ctx.user, 'menu', null);
        await deps.send(ctx.chat, `⚠️ ${res.message}`, ctx.mid, MAIN_KEYBOARD);
        return true;
      }

      repo.setState(ctx.user, 'menu', null);
      if (res.attendance) {
        repo.upsertAttendanceLog({
          user_id: ctx.user,
          student_id: link.student_id,
          national_code: link.national_code,
          date: res.attendance.date || ymd(nowSec()),
          period_number: res.attendance.period,
          period_title: res.attendance.title,
          status: res.attendance.status || 'present',
        });
      }

      const replyText = res.already_checked_in
        ? `ℹ️ ${res.message}`
        : `✅ ${res.message}\n(در سایت و ربات ثبت شد)`;
      await deps.send(ctx.chat, replyText, ctx.mid, MAIN_KEYBOARD);
      return true;
    }

    if (currentState === 'choosing_homework' && stateRow?.payload) {
      const payload = stateRow.payload as unknown as ChoosingHomeworkPayload;
      const choice = parseNonNegativeInt(ctx.text);
      const selected = choice !== null && choice >= 1 ? payload.homeworks[choice - 1] : undefined;

      if (!selected) {
        await deps.send(
          ctx.chat,
          `لطفاً شماره تکلیف را بین ۱ تا ${payload.homeworks.length} ارسال کنید (یا «${BTN_CANCEL}» را بزنید).`,
          ctx.mid,
          CANCEL_KEYBOARD,
        );
        return true;
      }
      const uploadPayload: UploadingHomeworkPayload = {
        homework_id: selected.id,
        homework_title: selected.title,
        already_submitted: selected.submitted,
        submitted_files_count: selected.submitted_files_count,
        score: selected.score,
        files: [],
      };
      repo.setState(ctx.user, 'uploading_homework', uploadPayload);

      const lines: string[] = [`📝 تکلیف انتخاب‌شده: «${selected.title}»`];

      if (selected.score !== null) {
        lines.push(
          `\n⚠️ هشدار: شما قبلاً برای این تکلیف ${selected.submitted_files_count} فایل ارسال کرده‌اید و نمره ${selected.score} برای شما ثبت شده است. ارسال جدید، فایل‌های قبلی را در سایت جایگزین می‌کند.`,
        );
      } else if (selected.submitted) {
        lines.push(
          `\n⚠️ هشدار: شما قبلاً برای این تکلیف ${selected.submitted_files_count} فایل ارسال کرده‌اید. ارسال جدید، فایل‌های قبلی را در سایت جایگزین می‌کند.`,
        );
      }

      lines.push(
        `\n📸 عکس‌های پاسخ خود را یکی‌یکی یا پشت سر هم بفرستید (حداکثر ۱۰ عکس و هر عکس تا ۸ مگابایت؛ مجموعاً تا ۲۰ مگابایت).\n` +
          `پس از پایان ارسال عکس‌ها، دکمه «${BTN_FINALIZE}» را بزنید.`,
      );

      await deps.send(ctx.chat, lines.join('\n'), ctx.mid, UPLOAD_KEYBOARD);
      return true;
    }

    // ── 6. Linked `menu` Fallback (Zero AI Calls in PV) ──────────────
    await deps.send(
      ctx.chat,
      `لطفاً از دکمه‌های منوی پایین استفاده کنید:\n«${BTN_ATTENDANCE}» | «${BTN_HOMEWORK}» | «${BTN_HELP}»`,
      ctx.mid,
      MAIN_KEYBOARD,
    );
    return true;
  };
}

export const privateMyClass: UseCase = createPrivateMyClass();
