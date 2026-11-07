import type { ChatContext, Deps, UseCase } from '../context.js';
import { checkInName, isStandaloneCheckIn } from '../attendanceCheckIn.js';
import { hhmm, ymd, weekdayOf } from '../util.js';
import { buildRepositories } from '../repositories.js';

export const replyCheckIn: UseCase = async (ctx: ChatContext, deps: Deps) => {
  // "X حاضر" or standalone "حاضر" anywhere in the group → attendance.
  // No reply needed, no roster/window required. Today only.
  const name = checkInName(ctx.text);
  if (name === null) return false;
  if ((ctx.msg.chat?.type ?? '') === 'private') return false;

  const repos = buildRepositories(deps.db);
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
  const displayName = isStandaloneCheckIn(ctx.text) ? ctx.name || 'حاضر' : name;
  repos.attendance.addReplyCheckin(ctx.chat, day, ctx.user, displayName, ctx.at);
  await deps.send(
    ctx.chat,
    `✅ حضور ثبت شد\n👤 ${displayName}\n🕒 ${hhmm(ctx.at)}\nخوش اومدی به کلاس 🌱`,
    ctx.mid,
  );
  return true;
};
