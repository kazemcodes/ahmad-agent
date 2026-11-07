import type { ChatContext, Deps, UseCase } from '../context.js';

export const startHelp: UseCase = async (ctx: ChatContext, deps: Deps) => {
  if (ctx.text === '/start' || ctx.text === '/help') {
    await deps.send(
      ctx.chat,
      "سلام، من آقای ناظر هستم. دانش‌آموزان در زمان کلاس نام خود را بفرستند.\nدستورات معلم: /class HH:MM HH:MM ، /roster نام‌ها (هر نام در یک خط)، /report ، /rename نام قدیم | نام جدید.\nبرای پرسش مرا با «آقای ناظر» صدا بزنید یا به پیام من پاسخ دهید.",
      ctx.mid,
    );
    return true;
  }
  return false;
};
