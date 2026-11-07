import { extractCompletion } from '../aiCompletion.js';
import { BaleImageReader } from '../baleImageReader.js';
import type { ChatContext, Deps, UseCase } from '../context.js';

export const visionCmd: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const m = ctx.msg;
  if (!(Array.isArray(m.photo) && m.photo.length && ctx.addressed)) return false;
  const { chat, user, mid, text } = ctx;
  if (!deps.config.vision_model || !deps.config.ai_url || !deps.config.ai_key) {
    await deps.send(chat, 'دیدن عکس هنوز تنظیم نشده؛ از مدیر بخواه مدل بینایی را تنظیم کند.', mid);
    return true;
  }
  if (!deps.queue.allow('chat', user, deps.config.chat_limit, 60)) {
    await deps.send(chat, 'پیام‌ها خیلی سریع رسیدند؛ لطفاً کمی بعد دوباره تلاش کن.', mid);
    return true;
  }
  try {
    const photo = m.photo[m.photo.length - 1];
    if (!photo?.file_id) throw new Error('Photo file ID missing');
    if (photo.file_size !== undefined && photo.file_size > 5 * 1024 * 1024) {
      throw new Error('Image exceeds 5 MB');
    }
    const file = await deps.bale.getFile(photo.file_id);
    const uri = await new BaleImageReader(deps.config.bale_token).dataUri(file?.result?.file_path ?? '');
    const question = text !== '' ? text : 'این تصویر را به زبان ساده توضیح بده.';
    const response = await deps.http.http(
      `${deps.config.ai_url}/chat/completions`,
      {
        model: deps.config.vision_model,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'تو آقای ناظر، دستیار آموزشی هستی. به سؤال درباره تصویر دقیق و صادقانه پاسخ بده و اگر چیزی واضح نیست بگو.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: uri } },
            ],
          },
        ],
      },
      { Authorization: `Bearer ${deps.config.ai_key}` },
    );
    const extracted = extractCompletion(response);
    const answer = extracted.text;
    if (answer === null) {
      deps.log('vision.empty_completion', { finish_reason: extracted.finishReason, shape: extracted.shape });
      throw new Error('Vision model returned no text');
    }
    await deps.send(chat, answer, mid);
    deps.memory.remember(chat, user, 'user', '[سؤال درباره تصویر] ' + question);
    deps.memory.remember(chat, user, 'assistant', answer);
  } catch (e) {
    deps.log('vision.error', { error: e instanceof Error ? e.message : String(e) });
    await deps.send(chat, 'نتوانستم این تصویر را بررسی کنم؛ لطفاً دوباره تلاش کن.', mid);
  }
  return true;
};
