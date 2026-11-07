// Port of src/ClassroomIntent.php
export function classroomIntent(text: string, addressed: boolean): string | null {
  if (!addressed || text.trim().startsWith('/')) return null;
  const t = text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');
  if (/(حاضر|حضور|غایب|غیبت|حضور و غیاب)/u.test(t) && /(کیا|کی |چه کسی|چه کسانی|چه افرادی|گزارش|لیست|فهرست|چند نفر|بگو|بده|بودن|بودند)/u.test(t)) {
    return '/report';
  }
  if (/(برنامه|ساعت|زمان)/u.test(t) && /(کلاس|هفتگی|امروز)/u.test(t)) {
    return t.includes('امروز') ? '/today' : '/schedules';
  }
  return null;
}
