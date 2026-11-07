import type { ChatContext, Deps, UseCase } from '../context.js';
import { WebSearch } from '../webSearch.js';

export const webSearchCmd: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const web = ctx.text.match(/^\/web(?:@\w+)?\s+([\s\S]+)$/u);
  if (!web) return false;
  const { chat, user, mid } = ctx;
  if (!deps.config.search_key) {
    await deps.send(chat, 'جستجوی وب هنوز تنظیم نشده است.', mid);
    return true;
  }
  if (!deps.queue.allow('chat', user, deps.config.chat_limit, 60)) {
    await deps.send(chat, 'درخواست‌ها زیاد شده؛ کمی بعد تلاش کن.', mid);
    return true;
  }
  try {
    const results = await new WebSearch(deps.config.search_key).search(web[1]!.trim());
    let out = 'نتایج جستجوی وب:\n';
    for (const r of results) out += '\n' + r.title + '\n' + r.url + '\n' + r.description + '\n';
    await deps.send(chat, results.length ? out : 'نتیجه‌ای پیدا نشد.', mid);
  } catch (e) {
    deps.log('web.error', { error: e instanceof Error ? e.message : String(e) });
    await deps.send(chat, 'جستجوی وب ممکن نشد؛ بعداً تلاش کن.', mid);
  }
  return true;
};
