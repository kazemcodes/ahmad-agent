import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { cpLen, hhmm, norm, substr, weekdayOf, ymd } from '../util.js';
import { nowSec } from '../logger.js';

const STAFF_RE = /^\/(class|schedule|schedules|today|unschedule|roster|report|sessions|rename|requests|approve|setnote|clearnote)(?:@\w+)?(?:\s+([\s\S]*))?$/u;

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
    const linked = deps.db.prepare('SELECT 1 AS x FROM roster WHERE chat=? AND user_id=?').get(chat, student);
    if (note === '' || cpLen(note) > 500 || !linked) {
      await deps.send(chat, 'دانش‌آموز باید به فهرست متصل باشد و یادداشت حداکثر ۵۰۰ نویسه باشد.', mid);
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

  if (cmd === 'sessions') {
    const day = ymd(nowSec());
    const windows = repos.classes.listTodayWithIds(chat, weekdayOf(nowSec()));
    let out = 'حضور کلاس‌های امروز:\n';
    for (const w of windows) {
      out += '\n' + w.start + ' تا ' + w.end + '\n';
      const rows = repos.attendance.sessionRows(chat, day, w.id);
      for (const r of rows) out += r.name + ' — ' + (r.at ? hhmm(Number(r.at)) : 'نامشخص') + '\n';
    }
    await deps.send(chat, windows.length ? out : 'برای امروز برنامه هفتگی ثبت نشده است.', mid);
    return true;
  }

  if (cmd === 'roster') {
    const names: string[] = [];
    for (const vRaw of arg.split(/[\r\n،,]+/u)) {
      const v = norm(vRaw);
      if (v !== '') names.push(v);
    }
    const n = repos.roster.addNames(chat, names);
    await deps.send(chat, `نام‌ها دریافت شد: ${n}`, mid);
    return true;
  }

  if (cmd === 'requests') {
    const rows = repos.corrections.listPending(chat);
    let out = 'درخواست‌های اصلاح نام:\n';
    for (const r of rows) out += '#' + r.id + ' — ' + r.requested + ' (' + r.user_id + ')\n';
    await deps.send(chat, rows.length ? out : 'درخواستی وجود ندارد.', mid);
    return true;
  }

  if (cmd === 'approve') {
    if (!/^\d+$/.test(arg)) {
      await deps.send(chat, 'نمونه: /approve 1', mid);
      return true;
    }
    const r = repos.corrections.getPending(Number(arg), chat);
    if (!r) {
      await deps.send(chat, 'درخواست پیدا نشد.', mid);
      return true;
    }
    const old = repos.roster.findByUser(chat, r.user_id);
    if (!old) {
      await deps.send(chat, 'دانش‌آموز ابتدا باید به یک نام در فهرست متصل شود.', mid);
      return true;
    }
    try {
      repos.roster.renameById(old.id, r.requested);
      repos.corrections.approve(r.id);
      await deps.send(chat, 'اصلاح نام تأیید شد.', mid);
    } catch {
      await deps.send(chat, 'نام تکراری است یا قابل ثبت نیست.', mid);
    }
    return true;
  }

  if (cmd === 'rename') {
    const p = arg.split('|', 2);
    if (p.length !== 2) {
      await deps.send(chat, 'نمونه: /rename نام قدیم | نام جدید', mid);
      return true;
    }
    try {
      const changes = repos.roster.rename(chat, norm(p[0]!), norm(p[1]!));
      await deps.send(chat, changes ? 'نام اصلاح شد.' : 'نام پیدا نشد.', mid);
    } catch {
      await deps.send(chat, 'این نام تکراری است یا قابل ثبت نیست.', mid);
    }
    return true;
  }

  // /report (fallthrough)
  const checkins = repos.attendance.listReplyToday(chat, ymd(nowSec()));
  if (checkins.length) {
    let out = "📋 گزارش حضور امروز\n🗓 " + ymd(nowSec()) + "\n━━━━━━━━━━━━━━\n";
    checkins.forEach((entry, i) => {
      out += `${i + 1}. ${entry.name}  ·  🕒 ${hhmm(Number(entry.at))}\n`;
    });
    out += `━━━━━━━━━━━━━━\n👥 تعداد ثبت‌شده: ${checkins.length} نفر\nℹ️ این گزارش بر اساس پیام‌های حضور ثبت‌شده است.`;
    await deps.send(chat, out, mid);
    return true;
  }
  const day = ymd(nowSec());
  const rows = repos.attendance.dailyRows(chat, day);
  if (!rows.length) {
    await deps.send(chat, 'برای این گفتگو هنوز فهرست دانش‌آموزان ثبت نشده است. معلم ابتدا با /roster نام‌ها را ثبت کند و زمان کلاس را تنظیم کند.', mid);
    return true;
  }
  let out = `گزارش ${day}\n`;
  for (const r of rows) out += r.name + ' — ' + (r.at ? 'ثبت حضور ' + hhmm(Number(r.at)) : 'نامشخص') + '\n';
  let windows: Array<{ start: string; end: string }> = repos.classes.listTodayWindows(chat, weekdayOf(nowSec())) as Array<{ start: string; end: string }>;
  if (!repos.classes.hasWeekly(chat)) {
    const legacy = repos.classes.getDaily(chat);
    if (legacy) windows = [legacy];
  }
  const counts = repos.attendance.messageCountsInWindows(chat, windows, day);
  out += "\nفعالیت در بازه کلاس (تعداد پیام):\n";
  for (const r of counts) out += r.name + ': ' + r.n + '\n';
  await deps.send(chat, out, mid);
  return true;
};
