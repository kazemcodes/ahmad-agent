import type { ChatContext, Deps, UseCase } from '../context.js';

export const startHelp: UseCase = async (ctx: ChatContext, deps: Deps) => {
  if (ctx.text === '/start' || ctx.text === '/help') {
    await deps.send(
      ctx.chat,
      "سلام، من آقای ناظر هستم. دانش‌آموزان «اسم حاضر» بنویسند تا حضور ثبت شود.\nدستورات: /report گزارش حضور، /today برنامه امروز، /class تنظیم ساعت کلاس.\nبرای پرسش مرا با «آقای ناظر» صدا بزنید یا به پیام من پاسخ دهید.",
      ctx.mid,
    );
    return true;
  }
  return false;
};
