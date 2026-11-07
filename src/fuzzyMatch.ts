// Port of src/FuzzyMatch.php — Levenshtein DP, code-point aware.
export function levenshtein(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const A = [...na];
  const B = [...nb];
  const la = A.length;
  const lb = B.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array<number>(lb + 1).fill(0);
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    const ca = A[i - 1];
    for (let j = 1; j <= lb; j++) {
      const cb = B[j - 1];
      const cost = ca === cb ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb]!;
}

export function bestMatch(input: string, candidates: string[]): string | null {
  const ni = normalize(input);
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const nc = normalize(c);
    if (nc === ni) return c;
    const d = levenshtein(ni, nc);
    const threshold = Math.max(1, Math.floor([...nc].length * 0.3));
    if (d <= threshold && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function normalize(s: string): string {
  return s
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
