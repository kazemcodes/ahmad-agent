// Port of src/ContextBudget.php — mb_strlen → code-point length.
import type { ChatMessage } from './types.js';

export function budgetHistory(
  turns: Array<{ role: string; content: string }>,
  maxTurns: number,
  maxChars: number,
): ChatMessage[] {
  if (maxTurns <= 0 || maxChars <= 0) return [];
  const result: ChatMessage[] = [];
  let remaining = maxChars;
  const sliced = turns.slice(-maxTurns).reverse();
  for (const turn of sliced) {
    if (typeof turn.content !== 'string') continue;
    if (turn.role !== 'user' && turn.role !== 'assistant') continue;
    const chars = [...turn.content];
    let content = turn.content;
    if (chars.length > remaining) {
      if (remaining < 100) break;
      content = chars.slice(0, remaining).join('') + '…';
    }
    result.unshift({ role: turn.role as 'user' | 'assistant', content });
    remaining -= [...content].length;
    if (remaining <= 0) break;
  }
  return result;
}
