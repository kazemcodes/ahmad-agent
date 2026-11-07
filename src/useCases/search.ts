import type { ChatContext, Deps, UseCase } from '../context.js';
import { cpLen, substr } from '../util.js';

export const searchCmd: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const { chat, user, mid, text } = ctx;
  const search = text.match(/^\/(search|mysearch)(?:@\w+)?\s+(.+)$/us);
  if (search) {
    if (search[1] === 'search' && !deps.staff(user)) {
      await deps.send(chat, 'جستجوی همه پیام‌ها فقط برای معلم یا مدیر مجاز است.', mid);
      return true;
    }
    const term = search[2]!.trim();
    if (cpLen(term) < 2) {
      await deps.send(chat, 'عبارت جستجو باید حداقل دو حرف باشد.', mid);
      return true;
    }
    const rows = deps.memory.search(chat, search[1] === 'mysearch' ? user : null, term);
    let output = 'نتایج جستجو:\n';
    for (const row of rows) {
      const d = new Date(row.at * 1000);
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      output += stamp + ' — ' + row.name + ': ' + substr(row.text, 200) + '\n';
    }
    await deps.send(chat, rows.length ? output : 'پیامی پیدا نشد.', mid);
    return true;
  }

  if (text === '/forget') {
    deps.memory.forget(chat, user);
    await deps.send(chat, 'حافظه گفت‌وگوی ما پاک شد؛ پیام‌های کلاس و حضور جداگانه نگهداری می‌شوند.', mid);
    return true;
  }
  return false;
};
