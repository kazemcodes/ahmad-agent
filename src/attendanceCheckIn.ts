// Port of src/AttendanceCheckIn.php — "حاضر" check-in detection.
// Expanded: plain "حاضر", "حاضرم", "من حاضرم", "حاضر شدم", "حاضریم", name+"حاضر",
// plus greeting-style check-ins like "سلام عبدالواحد راوند".
export function checkInName(text: string): string | null {
  const t = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');

  // "Name حاضر" — named check-in (original PHP pattern)
  const m = t.match(/^(.{2,80}?)\s+حاضر[\s.!؟!]*$/u);
  if (m) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (/^[\p{L}\s-]+$/u.test(name)) return name;
  }

  // "سلام X" greeting + name → treat as check-in (e.g. "سلام عبدالواحد راوند")
  const greeting = t.match(/^(سلام|درود|درود بر شما|با سلام)(?:\s+(.+))?$/u);
  if (greeting && greeting[2]) {
    const name = greeting[2].trim().replace(/\s+/g, ' ');
    if (/^[\p{L}\s-]+$/u.test(name) && [...name].length >= 2) return name;
  }

  // Standalone check-in words (no name embedded)
  if (/^(من\s+)?(حاضر|حاضرم|حاضر شدم|حاضریم|حاضر هستم|اومدم|رسیدم)[\s.!؟!]*$/u.test(t)) {
    return 'حاضر';
  }

  return null;
}

export function isStandaloneCheckIn(text: string): boolean {
  return checkInName(text) === 'حاضر';
}

/** Display name for a standalone greeting check-in. */
export function greetingName(text: string): string | null {
  const t = text.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');
  const m = t.match(/^(سلام|درود|درود بر شما|با سلام)\s+(.+)$/u);
  if (!m) return null;
  const name = (m[2] ?? '').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\s-]+$/u.test(name) ? name : null;
}
