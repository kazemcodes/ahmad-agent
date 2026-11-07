import { bestMatch } from '../fuzzyMatch.js';
import type { ChatContext, Deps, UseCase } from '../context.js';
import { buildRepositories } from '../repositories.js';
import { hhmm, norm, weekdayOf, ymd } from '../util.js';

type ClassWindow = { start: string; end: string; id?: number };

export const nameCheckIn: UseCase = async (ctx: ChatContext, deps: Deps) => {
  const { chat, user, mid, at, text } = ctx;
  const repos = buildRepositories(deps.db);
  const time = hhmm(at);
  let cls: ClassWindow | undefined = repos.classes.getActiveSchedule(chat, weekdayOf(at), time);
  if (!repos.classes.hasWeekly(chat)) {
    cls = repos.classes.getDaily(chat);
  }
  const graceFrom = cls?.start
    ? hhmm(Date.parse(`${ymd(at)} ${cls.start}`) / 1000 - (deps.config.grace_minutes ?? 7) * 60)
    : null;
  if (!(cls && graceFrom !== null && time >= graceFrom && time <= cls.end && text !== '')) return false;

  let matches = repos.roster.findByName(chat, norm(text));
  if (matches.length === 0 && (deps.config.fuzzy_match ?? true)) {
    const names = repos.roster.listAll(chat);
    const best = bestMatch(text, names.map((n) => n.name));
    if (best !== null) matches = names.filter((n) => n.name === best);
  }
  if (matches.length !== 1) return false;
  const r = matches[0]!;
  if (r.user_id !== null && Number(r.user_id) !== user) {
    await deps.send(chat, 'این نام قبلاً به حساب دیگری متصل شده است؛ لطفاً از معلم کمک بخواهید.', mid);
    return true;
  }
  const linked = repos.roster.findOtherLinked(chat, user, r.id);
  if (linked) {
    await deps.send(chat, 'حساب شما به نام دیگری متصل است؛ لطفاً از معلم بخواهید آن را اصلاح کند.', mid);
    return true;
  }
  repos.roster.linkUser(r.id, user);
  const day = ymd(at);
  repos.attendance.addDaily(chat, day, r.id, at);
  if (cls.id !== undefined) {
    repos.attendance.addSession(chat, day, cls.id, r.id, at);
  }
  const late = time > hhmm(Date.parse(`${ymd(at)} ${cls.start}`) / 1000 + (deps.config.grace_minutes ?? 7) * 60);
  await deps.send(chat, `${r.name} عزیز، حضورت ثبت شد${late ? ' (پس از شروع کلاس)' : ''}.`, mid);
  return true;
};
