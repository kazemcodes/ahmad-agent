import type { ChatContext, Deps, UseCase } from '../context.js';
import { cpLen } from '../util.js';
import { VoiceTranscriber } from '../voiceTranscriber.js';
import { chatCmd } from './chat.js';

export const voiceCmd: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const m = ctx.msg;
  if (!(m.voice?.file_id && ctx.addressed)) return false;
  const { chat, user, mid } = ctx;
  if (!deps.queue.allow('voice', user, deps.config.chat_limit, 60)) {
    await deps.send(chat, 'پیام‌های صوتی زیاد شده؛ کمی بعد تلاش کن.', mid);
    return true;
  }
  if (!deps.config.voice_model || !deps.config.voice_key || !deps.config.voice_url) {
    await deps.send(chat, 'تبدیل پیام صوتی هنوز تنظیم نشده است.', mid);
    return true;
  }
  if (m.voice.file_size !== undefined && m.voice.file_size > 10 * 1024 * 1024) {
    await deps.send(chat, 'حجم پیام صوتی باید کمتر از ۱۰ مگابایت باشد.', mid);
    return true;
  }
  try {
    const file = await deps.bale.getFile(m.voice.file_id);
    const transcriber = new VoiceTranscriber(
      deps.config.bale_token,
      deps.config.voice_url,
      deps.config.voice_key,
      deps.config.voice_model,
    );
    const transcribed = await transcriber.transcribe(file?.result?.file_path ?? '');
    deps.log('voice.transcribed', { chat_id: chat, chars: cpLen(transcribed) });
    await chatCmd({ ...ctx, text: transcribed, effectiveText: transcribed }, deps);
    return true;
  } catch (e) {
    deps.log('voice.error', { error: e instanceof Error ? e.message : String(e) });
    await deps.send(chat, 'متوجه پیام صوتی نشدم؛ لطفاً دوباره بفرست.', mid);
    return true;
  }
};
