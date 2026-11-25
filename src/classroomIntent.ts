// Port of src/ClassroomIntent.php — intent rewriting (NL → /command).
// Expanded with a second pass: regex first (free, instant); if no match,
// the caller may fall back to an AI classifier (see ahmad.ts handle()).

const WB_START = '(?<![\\p{L}\\p{N}\\u200c])';
const WB_END = '(?![\\p{L}\\p{N}\\u200c])';
const word = (pattern: string): RegExp => new RegExp(`${WB_START}(?:${pattern})${WB_END}`, 'u');

const REPORT_EXPLICIT_1 = new RegExp(
  `${WB_START}(?:گزارش|لیست|فهرست|آمار|تعداد)${WB_END}.*${WB_START}(?:حضور|حاضران|حاضرین|غایبان|غایبین|حضور و غیاب)${WB_END}`,
  'u',
);
const REPORT_EXPLICIT_2 = new RegExp(
  `${WB_START}(?:حضور و غیاب|حاضران|حاضرین|غایبان|غایبین)${WB_END}.*${WB_START}(?:گزارش|لیست|فهرست|بده|بگو|بفرست|نشان بده|نشون بده|بیار|کیا|چند|چنده)${WB_END}`,
  'u',
);
const REPORT_WHO = new RegExp(
  `${WB_START}(?:کیا|کی|چه کسانی|چه افرادی|چه کسایی|چند نفر)${WB_END}\\s+(?:(?:امروز|توی کلاس|در کلاس|سر کلاس|الان)\\s+){0,2}(?:حاضر|حاضرن|حاضرند|حاضرین|غایب|غایبن|غایبند|حضور)${WB_END}`,
  'u',
);

const SCHEDULE_PROGRAM = word('برنامه');
const SCHEDULE_TIME = word('برنامه|ساعت|زمان');
const SCHEDULE_TODAY = word('امروز');
const SCHEDULE_CLASS = word('کلاس|کلاس‌ها|کلاس ها|کلاسها|هفتگی');

export function classroomIntent(text: string, addressed: boolean): string | null {
  if (!addressed || text.trim().startsWith('/')) return null;
  const t = text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip bot mention / salutation to inspect the actual request.
  const core = t.replace(/^(?:(?:آقای ناظر|@\w+|استاد|لطفا|لطفاً)[،,\s:]*)+/u, '').trim();
  // Long messages are almost certainly general questions/chat, not short commands.
  if (core === '' || core.length > 80) return null;

  // ---- /report (attendance) ----
  // Ignore the common Persian idiom "در حال حاضر" ("currently") when checking attendance intent.
  const attendanceText = core.replace(new RegExp(`${WB_START}در حال حاضر${WB_END}`, 'u'), ' ').trim();
  if (
    REPORT_EXPLICIT_1.test(attendanceText) ||
    REPORT_EXPLICIT_2.test(attendanceText) ||
    REPORT_WHO.test(attendanceText)
  ) {
    return '/report';
  }

  // ---- /today /schedules (class schedule) ----
  if (
    (SCHEDULE_PROGRAM.test(core) && SCHEDULE_TODAY.test(core)) ||
    (SCHEDULE_TIME.test(core) && SCHEDULE_CLASS.test(core))
  ) {
    return SCHEDULE_TODAY.test(core) ? '/today' : '/schedules';
  }

  return null;
}
