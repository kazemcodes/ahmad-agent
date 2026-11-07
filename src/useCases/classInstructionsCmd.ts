import type { ChatContext, Deps, UseCase } from '../context.js';
import { parseInstruction } from '../classInstructions.js';
import { cpLen } from '../util.js';

export const classInstructionsCmd: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const remember = parseInstruction(ctx.text);
  if (remember !== null && (ctx.addressed || deps.staff(ctx.user))) {
    if (!deps.staff(ctx.user)) {
      await deps.send(ctx.chat, 'فقط معلم یا مدیر می‌تواند دستور مربوط به کل کلاس را ذخیره کند.', ctx.mid);
      return true;
    }
    if (cpLen(remember) > 500) {
      await deps.send(ctx.chat, 'لطفاً یادداشت را کوتاه‌تر از ۵۰۰ نویسه بنویس.', ctx.mid);
      return true;
    }
    const id = ctx.instructions.add(ctx.chat, ctx.user, remember);
    await deps.send(ctx.chat, '✅ یادداشت شماره ' + id + ' برای همین گفتگو ذخیره شد.', ctx.mid);
    return true;
  }

  const rule = ctx.text.match(/^\/(memories|forgetrule)(?:@\w+)?(?:\s+(\d+))?$/u);
  if (rule) {
    if (!deps.staff(ctx.user)) {
      await deps.send(ctx.chat, 'این دستور فقط برای معلم یا مدیر مجاز است.', ctx.mid);
      return true;
    }
    if (rule[1] === 'forgetrule') {
      const deleted = rule[2] !== undefined && ctx.instructions.remove(ctx.chat, Number(rule[2]));
      await deps.send(ctx.chat, deleted ? 'یادداشت حذف شد.' : 'شماره یادداشت را وارد کن؛ نمونه: /forgetrule 1', ctx.mid);
      return true;
    }
    const rows = ctx.instructions.list(ctx.chat);
    let out = 'یادداشت‌های کلاس:\n';
    for (const r of rows) out += '#' + r.id + ' ' + r.instruction + '\n';
    await deps.send(ctx.chat, rows.length ? out : 'یادداشتی ثبت نشده است.', ctx.mid);
    return true;
  }
  return false;
};
