// Port of src/AttendanceCheckIn.php
export function checkInName(text: string): string | null {
  const t = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');
  const m = t.match(/^(.{2,80}?)\s+حاضر[\s.!؟!]*$/u);
  if (!m) return null;
  const name = m[1]!.trim().replace(/\s+/g, ' ');
  return /^[\p{L}\s-]+$/u.test(name) ? name : null;
}
