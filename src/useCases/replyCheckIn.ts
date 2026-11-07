import type { ChatContext, Deps, UseCase } from '../context.js';
import { checkInName } from '../attendanceCheckIn.js';
import { hhmm, ymd, weekdayOf } from '../util.js';
import { buildRepositories } from '../repositories.js';

export const replyCheckIn: UseCase = async (ctx: ChatContext, deps: Deps) => {
  if (!ctx.isBotReply) return false;
  const name = checkInName(ctx.text);
  if (name === null) return false;
  if ((ctx.msg.chat?.type ?? '') === 'private') return false;

  const repos = buildRepositories(deps.db);
  const time = hhmm(ctx.at);
  const weekday = weekdayOf(ctx.at);
  const weekly = repos.classes.hasWeekly(ctx.chat);
  const daily = repos.classes.getDaily(ctx.chat);
  let active: boolean;
  if (weekly) {
    active = repos.classes.isScheduleActiveNow(ctx.chat, weekday, time);
  } else if (daily) {
    active = time >= daily.start && time <= daily.end;
  } else {
    active = true;
  }
  if (!active) {
    await deps.send(ctx.chat, '⏰ الان خارج از زمان ثبت‌شدهٔ کلاس است؛ لطفاً از معلم کمک بگیر.', ctx.mid);
    return true;
  }
  const day = ymd(ctx.at);
  const existing = repos.attendance.replyExisting(ctx.chat, day, ctx.user);
  if (existing) {
    await deps.send(
      ctx.chat,
      `✅ ${existing.name} عزیز، حضورت قبلاً ساعت ${hhmm(Number(existing.at))} ثبت شده است.`,
      ctx.mid,
    );
    return true;
  }
  repos.attendance.addReplyCheckin(ctx.chat, day, ctx.user, name, ctx.at);
  await deps.send(
    ctx.chat,
    `✅ حضور ثبت شد\n👤 ${name}\n🕒 ${hhmm(ctx.at)}\nخوش اومدی به کلاس 🌱`,
    ctx.mid,
  );
  return true;
};
