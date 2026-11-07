// Port of src/AttendanceCheckIn.php — "حاضر" check-in detection.
// Expanded: plain "حاضر", "حاضرم", "من حاضرم", "حاضر شدم", "حاضریم", name+"حاضر"
export function checkInName(text: string): string | null {
  const t = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');

  // "Name حاضر" / "نام من X است" — named check-in (original PHP pattern)
  const m = t.match(/^(.{2,80}?)\s+حاضر[\s.!؟!]*$/u);
  if (m) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (/^[\p{L}\s-]+$/u.test(name)) return name;
  }

  // Standalone check-in words (no name needed — registration handled by caller)
  if (/^(من\s+)?(حاضر|حاضرم|حاضر شدم|حاضریم|حاضر هستم|اومدیم|اومدم|رسیدم)[\s.!؟!]*$/u.test(t)) {
    return 'حاضر';
  }

  return null;
}

/** Is this text a standalone check-in word (no name embedded)? */
export function isStandaloneCheckIn(text: string): boolean {
  return checkInName(text) === 'حاضر';
}
