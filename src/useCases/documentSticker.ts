import type { ChatContext, Deps, UseCase } from '../context.js';

export const documentSticker: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const m = ctx.msg;
  if (m.document && ctx.addressed) {
    deps.log('document.received', { chat_id: ctx.chat, file: m.document.file_name ?? '' });
    await deps.send(ctx.chat, '📄 فایل دریافت شد؛ پردازش اسناد در نسخه فعلی پشتیبانی نمی‌شود.', ctx.mid);
    return true;
  }
  if (m.sticker && ctx.addressed) {
    deps.log('sticker.received', { chat_id: ctx.chat });
    await deps.send(ctx.chat, 'استیکر دریافت شد 😊', ctx.mid);
    return true;
  }
  return false;
};
