// Port of src/ClassroomIntent.php — intent rewriting (NL → /command).
// Expanded with a second pass: regex first (free, instant); if no match,
// the caller may fall back to an AI classifier (see ahmad.ts handle()).
export function classroomIntent(text: string, addressed: boolean): string | null {
  if (!addressed || text.trim().startsWith('/')) return null;
  const t = text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');

  // ---- /report (attendance) ----
  if (
    /(حاضر|حضور|غایب|غیبت|حضور و غیاب)/u.test(t) &&
    /(کیا|کی |چه کسی|چه کسانی|چه افرادی|گزارش|لیست|فهرست|چند نفر|بگو|بده|بودن|بودند|نفرات|حاضران|امروز|نشان بده|بیار)/u.test(t)
  ) {
    return '/report';
  }

  // ---- /today /schedules (class schedule) ----
  if (/(برنامه|ساعت|زمان)/u.test(t) && /(کلاس|هفتگی|امروز)/u.test(t)) {
    return t.includes('امروز') ? '/today' : '/schedules';
  }

  // ---- /confirm (take attendance) ----
  if (/(حضور|غیاب|ثبت|حاضر|حضورت|حاضری|دفتر)/u.test(t) && /(بزن|بگیر|انجام بده|شروع کن|بررسی کن|چک کن)/u.test(t)) {
    return '/confirm';
  }

  // ---- /image (generate image) ----
  if (
    /(عکس|تصویر|نقاشی|عکس درست کن|تصویر بساز)/u.test(t) &&
    /(بساز|بکش|تولید کن|درست کن|ایجاد کن)/u.test(t)
  ) {
    return t.startsWith('/') ? null : t; // natural-language image request
  }

  // ---- /web (web search) ----
  if (/(جستجو کن|سرچ کن|درباره|اطلاعات بده|خبر|اخبار|آمار|نتایج)/u.test(t) && /(چی|چیه|کجا|کی|چطور|چه چیزی|چه خبر)/u.test(t)) {
    const q = t.replace(/^(آقای ناظر|استاد|لطفا|لطفاً)\s*/u, '').trim();
    if (q !== '') return '/web ' + q;
  }

  // ---- celebrate / thanks ----
  if (/(آفرین|عالی|احسنت|خوش گذشت|خسته نباشید)/u.test(t)) {
    return '/cheer';
  }

  return null;
}
