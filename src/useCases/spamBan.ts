// Spam ban management — /ban and /unban (staff only).
// The anti-spam ban (≥5 identical messages in 60s) is handled in ahmad.ts handle();
// this module only exposes manual staff commands.
import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { nowSec } from '../logger.js';

export const spamBan: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const m = ctx.text.match(/^\/(ban|unban)(?:@\w+)?\s+(\d+)$/u);
  if (!m) return false;
  if (!deps.staff(ctx.user)) {
    await deps.send(ctx.chat, 'این دستور فقط برای معلم یا مدیر مجاز است.', ctx.mid);
    return true;
  }
  const target = Number(m[2]);
  const repos = buildRepositories(deps.db);
  if (m[1] === 'ban') {
    repos.updates.banUser(ctx.chat, target, nowSec());
    await deps.send(ctx.chat, `کاربر ${target} برای نیم ساعت محدود شد.`, ctx.mid);
  } else {
    deps.db.prepare('DELETE FROM spam_bans WHERE chat=? AND user_id=?').run(ctx.chat, target);
    await deps.send(ctx.chat, `محدودیت کاربر ${target} برداشته شد.`, ctx.mid);
  }
  return true;
};
