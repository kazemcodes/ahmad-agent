import type { ChatContext, Deps, UseCase } from '../context.js';
import { checkInName, isStandaloneCheckIn } from '../attendanceCheckIn.js';
import { hhmm, ymd } from '../util.js';
import { buildRepositories } from '../repositories.js';

const SESSION_GAP_SECONDS = 30 * 60; // 30 minutes — separate check-ins allowed after this gap

export const replyCheckIn: UseCase = async (ctx: ChatContext, deps: Deps) => {
  // "X حاضر" or standalone "حاضر" anywhere in the group → attendance.
  // No reply needed, no roster/window required. Today only.
  // Multiple check-ins per day allowed (one per class session, ≥30 min apart).
  const name = checkInName(ctx.text);
  if (name === null) return false;
  if ((ctx.msg.chat?.type ?? '') === 'private') return false;

  const repos = buildRepositories(deps.db);
  const day = ymd(ctx.at);
  const existing = repos.attendance.replyExisting(ctx.chat, day, ctx.user);

  // If the last check-in was <30 min ago → treat as duplicate, show existing.
  if (existing && ctx.at - Number(existing.at) < SESSION_GAP_SECONDS) {
    await deps.send(
      ctx.chat,
      `✅ ${existing.name} عزیز، حضورت ساعت ${hhmm(Number(existing.at))} ثبت شده است.`,
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
