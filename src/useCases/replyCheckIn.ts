import type { ChatContext, Deps, UseCase } from '../context.js';
import { checkInName, isStandaloneCheckIn } from '../attendanceCheckIn.js';
import { hhmm, ymd } from '../util.js';
import { buildRepositories } from '../repositories.js';

const SESSION_GAP_SECONDS = 30 * 60; // 30 minutes — separate check-ins allowed after this gap

export const replyCheckIn: UseCase = async (ctx: ChatContext, deps: Deps) => {
  // Strict: only "Name حاضر" registers attendance.
  // Multiple check-ins per day allowed (one per class session, ≥30 min apart).
  // A second check-in with a DIFFERENT name within 30 min replaces the first
  // (name correction — e.g. "محمد رحیمی حاضر" then "علی زارعی حاضر").
  const name = checkInName(ctx.text);
  if (name === null) return false;
  if ((ctx.msg.chat?.type ?? '') === 'private') return false;

  const repos = buildRepositories(deps.db);
  const day = ymd(ctx.at);
  const existing = repos.attendance.replyExisting(ctx.chat, day, ctx.user);

  // Duplicate within 30 min:
  if (existing && ctx.at - Number(existing.at) < SESSION_GAP_SECONDS) {
    if (existing.name === name) {
      // Same name → just confirm existing.
      await deps.send(
        ctx.chat,
        `✅ ${existing.name} عزیز، حضورت ساعت ${hhmm(Number(existing.at))} ثبت شده است.`,
        ctx.mid,
      );
      return true;
    }
    // Different name → replace the existing record (name correction).
    deps.db
      .prepare('UPDATE reply_checkins SET name=?, at=? WHERE chat=? AND day=? AND user_id=? AND at=?')
      .run(name, ctx.at, ctx.chat, day, ctx.user, Number(existing.at));
    await deps.send(
      ctx.chat,
      `✅ نام به‌روزرسانی شد: ${name}\n🕒 ${hhmm(ctx.at)}`,
      ctx.mid,
    );
    return true;
  }

  // New session (≥30 min since last, or first check-in today).
  const displayName = isStandaloneCheckIn(ctx.text) ? ctx.name || 'حاضر' : name;
  repos.attendance.addReplyCheckin(ctx.chat, day, ctx.user, displayName, ctx.at);
  await deps.send(
    ctx.chat,
    `✅ حضور ثبت شد\n👤 ${displayName}\n🕒 ${hhmm(ctx.at)}\nخوش اومدی به کلاس 🌱`,
    ctx.mid,
  );
  return true;
};
