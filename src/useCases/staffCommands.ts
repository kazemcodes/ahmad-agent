import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { cpLen, hhmm, weekdayOf, ymd } from '../util.js';
import { nowSec } from '../logger.js';

const STAFF_RE = /^\/(report|class|schedule|schedules|today|unschedule|setnote|clearnote)(?:@\w+)?(?:\s+([\s\S]*))?$/u;

export const staffCommands: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const m = ctx.effectiveText.match(STAFF_RE);
  if (!m) return false;
  const { chat, user, mid } = ctx;
  if (!deps.staff(user)) {
    await deps.send(chat, 'این دستور فقط برای معلم یا مدیر مجاز است.', mid);
    return true;
  }
  const cmd = m[1]!;
  const arg = (m[2] ?? '').trim();
  const repos = buildRepositories(deps.db);

  if (cmd === 'class') {
    const t = arg.match(/^(\d{2}:\d{2})\s+(\d{2}:\d{2})$/);
    if (!t || t[1]! >= '24:00' || t[2]! >= '24:00' || t[1]!.slice(3) >= '60' || t[2]!.slice(3) >= '60' || t[1]! >= t[2]!) {
      await deps.send(chat, 'نمونه: /class 08:00 09:30', mid);
      return true;
    }
    repos.classes.upsertDaily(chat, t[1]!, t[2]!);
    await deps.send(chat, 'زمان کلاس ذخیره شد.', mid);
    return true;
  }

  if (cmd === 'schedule') {
    const parts = arg.match(/^([0-6])\s+([0-2][0-9]:[0-5][0-9])\s+([0-2][0-9]:[0-5][0-9])$/);
    if (!parts || parts[2]! >= '24:00' || parts[3]! >= '24:00' || parts[2]! >= parts[3]!) {
      await deps.send(chat, 'نمونه: /schedule 6 08:00 09:30 (شنبه ۶، یکشنبه ۰)', mid);
      return true;
    }
    repos.classes.addSchedule(chat, Number(parts[1]), parts[2]!, parts[3]!);
    await deps.send(chat, 'زمان هفتگی کلاس ثبت شد.', mid);
    return true;
  }

  if (cmd === 'today') {
    let rows = repos.classes.listTodayWindows(chat, weekdayOf(nowSec()));
    if (!repos.classes.hasWeekly(chat)) {
      const daily = repos.classes.getDaily(chat);
      if (daily) rows = [daily];
    }
    let out = 'برنامه امروز:\n';
    for (const r of rows) out += r.start + ' تا ' + r.end + '\n';
    await deps.send(chat, rows.length ? out : 'برای امروز کلاسی ثبت نشده است.', mid);
    return true;
  }

  if (cmd === 'setnote' || cmd === 'clearnote') {
    const noteArgs = arg.match(/^(\d+)(?:\s+([\s\S]+))?$/u);
    if (!noteArgs) {
      await deps.send(chat, 'نمونه: /setnote شناسه توضیح کوتاه', mid);
      return true;
    }
    const student = Number(noteArgs[1]);
    const note = (noteArgs[2] ?? '').trim();
    if (cmd === 'clearnote') {
      deps.memory.deleteNote(chat, student);
      await deps.send(chat, 'یادداشت حذف شد.', mid);
      return true;
    }
    if (note === '' || cpLen(note) > 500) {
      await deps.send(chat, 'یادداشت باید حداکثر ۵۰۰ نویسه باشد.', mid);
      return true;
    }
    deps.memory.setNote(chat, student, note);
    await deps.send(chat, 'یادداشت آموزشی ذخیره شد.', mid);
    return true;
  }

  if (cmd === 'schedules') {
    const rows = repos.classes.listSchedules(chat);
    const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    let out = 'برنامه هفتگی:\n';
    for (const r of rows) out += '#' + r.id + ' ' + days[Number(r.weekday)] + ' ' + r.start + ' تا ' + r.end + '\n';
    await deps.send(chat, rows.length ? out : 'برنامه هفتگی ثبت نشده است.', mid);
    return true;
  }

  if (cmd === 'unschedule') {
    if (!/^\d+$/.test(arg)) {
      await deps.send(chat, 'نمونه: /unschedule 1', mid);
      return true;
    }
    const deleted = repos.classes.deleteSchedule(chat, Number(arg));
    await deps.send(chat, deleted ? 'زمان حذف شد.' : 'زمان پیدا نشد.', mid);
    return true;
  }

  // /report
  const day = ymd(nowSec());
  const checkins = repos.attendance.listReplyToday(chat, day);
  if (checkins.length) {
    let out = "📋 گزارش حضور امروز\n🗓 " + day + "\n━━━━━━━━━━━━━━\n";
    checkins.forEach((entry, i) => {
      const msgCount = Number(entry.msg_count ?? 0);
      out += `${i + 1}. ${entry.name}  ·  🕒 ${hhmm(Number(entry.at))}  ·  💬 ${msgCount} پیام\n`;
    });
    out += `━━━━━━━━━━━━━━\n👥 تعداد ثبت‌شده: ${checkins.length} نفر\nℹ️ این گزارش بر اساس پیام‌های حضور امروز ثبت‌شده است.`;
    await deps.send(chat, out, mid);
    return true;
  }
  await deps.send(chat, 'امروز هنوز هیچ حضوری ثبت نشده است.', mid);
  return true;
};
