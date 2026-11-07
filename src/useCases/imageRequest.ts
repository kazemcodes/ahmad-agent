import type { ChatContext, Deps, UseCase } from '../context.js';
import { substr } from '../util.js';

const IMAGE_VERB = /(بساز|بکش|تولید کن|درست کن|ایجاد کن|بفرست|میخوام|می‌خوام|میخواهم)/u;

export const imageRequest: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const { chat, user, mid, text } = ctx;

  // /video (stub)
  const video = text.match(/^\/video(?:@\w+)?\s+([\s\S]+)$/u);
  if (video) {
    await deps.send(chat, '🎬 ساخت ویدیو در نسخه فعلی در دسترس نیست. (درخواست: ' + substr(video[1]!.trim(), 80) + ')', mid);
    return true;
  }

  // Image prompt detection
  let imagePrompt: string | null = null;
  const imageCmd = text.match(/^\/image(?:@\w+)?\s+([\s\S]+)$/u);
  if (imageCmd) {
    imagePrompt = imageCmd[1]!.trim();
  } else if (/(ویدیو|فیلم)/u.test(text) && /(بساز|بکش|تولید کن|درست کن|ایجاد کن)/u.test(text) && ctx.addressed) {
    await deps.send(chat, '🎬 ساخت ویدیو هنوز فعال نیست؛ فقط تصویر پشتیبانی می‌شود.', mid);
    return true;
  } else if (
    /(عکس|تصویر|نقاشی)/u.test(text) &&
    IMAGE_VERB.test(text) &&
    ((ctx.msg.chat?.type ?? '') === 'private' ||
      text.includes('آقای ناظر') ||
      (!!deps.config.bot_username && text.toLowerCase().includes('@' + deps.config.bot_username.toLowerCase())) ||
      (!!deps.config.bot_username && ctx.replyUsername.toLowerCase() === deps.config.bot_username.toLowerCase()))
  ) {
    imagePrompt = text;
  }

  if (imagePrompt === null) return false;

  if (!deps.queue.allow('image', user, deps.config.image_limit, 3600)) {
    await deps.send(chat, 'درخواست تصویر زیاد شده؛ لطفاً کمی بعد دوباره تلاش کن.', mid);
    return true;
  }
  const geminiConfigured = !!deps.config.gemini_image_key && !!deps.config.gemini_image_model;
  const primaryConfigured = !!deps.config.image_key && !!deps.config.image_model;
  if (deps.config.image_provider === 'gemini' ? !geminiConfigured : !primaryConfigured) {
    await deps.send(chat, 'سرویس تولید تصویر تنظیم نشده است.', mid);
    return true;
  }
  try {
    const result = deps.imageQueue.enqueue(ctx.update, chat, user, mid, imagePrompt);
    deps.log('image.queued', { chat_id: chat, job: result.id, dedup: result.deduplicated, position: result.position });
    await deps.typing(chat, 'upload_photo');
    if (result.deduplicated) {
      await deps.send(chat, '⏳ تصویرت هم‌اکنون در حال ساخته؛ پس از آماده شدن همین‌جا ارسال می‌کنم. لطفاً دوباره نفرست 😊', mid);
    } else if (result.position > 1) {
      await deps.send(chat, `⏳ تصویرت در صف است (شماره ${result.position}). پس از آماده شدن ارسال می‌کنم.`, mid);
    } else {
      await deps.send(chat, '⏳ در حال ساخت تصویر…', mid);
    }
  } catch (e) {
    deps.log('image.enqueue_failed', { error: e instanceof Error ? e.message : String(e) });
    await deps.send(chat, 'نتوانستم درخواست تصویرت را ثبت کنم؛ کمی بعد دوباره تلاش کن.', mid);
  }
  return true;
};
