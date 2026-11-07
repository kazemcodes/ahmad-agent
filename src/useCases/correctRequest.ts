import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { norm } from '../util.js';

// Name correction is now a simple store-and-rename on the attendance record —
// no corrections table, no approval flow. The bot updates the name on the
// student's most recent check-in record and acknowledges it.
export const correctRequest: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const change = ctx.text.match(/^\/correct(?:@\w+)?\s+(.+)$/u);
  if (!change) return false;
  const newName = norm(change[1]!);
  if (newName === '') return true;

  const repos = buildRepositories(deps.db);
  // Update any pending reply_checkins from this user today (or just all).
  try {
    deps.db
      .prepare('UPDATE reply_checkins SET name=? WHERE chat=? AND user_id=?')
      .run(newName, ctx.chat, ctx.user);
  } catch {
    /* table may not exist on old DBs */
  }
  // Also persist as a correction request for teacher visibility.
  repos.corrections.add(ctx.chat, ctx.user, newName);
  await deps.send(ctx.chat, `نام تو به «${newName}» به‌روزرسانی شد.`, ctx.mid);
  return true;
};
