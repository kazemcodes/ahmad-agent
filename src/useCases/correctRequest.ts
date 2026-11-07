import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { norm } from '../util.js';

export const correctRequest: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const change = ctx.text.match(/^\/correct(?:@\w+)?\s+(.+)$/u);
  if (!change) return false;
  const newName = norm(change[1]!);
  if (newName === '') return true;
  buildRepositories(deps.db).corrections.add(ctx.chat, ctx.user, newName);
  await deps.send(ctx.chat, 'درخواست اصلاح نام برای بررسی معلم ثبت شد.', ctx.mid);
  return true;
};
