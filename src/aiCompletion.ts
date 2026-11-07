// Robust choice-content extraction from an OpenAI-compatible chat response.
// Returns the first non-empty text found across the known field variants,
// plus finish_reason and a compact shape descriptor for logging.
export interface ExtractedCompletion {
  text: string | null;
  finishReason: string | null;
  shape: string[];
}

function asText(value: any): string | null {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
        return '';
      })
      .filter((s) => s !== '');
    return parts.length ? parts.join('') : null;
  }
  return null;
}

function keys(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).sort();
}

export function extractCompletion(res: any): ExtractedCompletion {
  const choice = res?.choices?.[0];
  if (!choice || typeof choice !== 'object') {
    return { text: null, finishReason: null, shape: [] };
  }
  const message = choice.message ?? {};
  const delta = choice.delta ?? {};
  const finishReason =
    typeof choice.finish_reason === 'string' ? choice.finish_reason : null;

  const candidates: unknown[] = [
    message.content,
    delta.content,
    message.text,
    choice.text,
    delta.text,
    message.reasoning_content,
    message.reasoning,
    delta.reasoning_content,
  ];
  for (const c of candidates) {
    const t = asText(c);
    if (t !== null) return { text: t, finishReason, shape: [...keys(choice), 'choice.message' + JSON.stringify(keys(message))] };
  }
  return {
    text: null,
    finishReason,
    shape: [...keys(choice), 'choice.message' + JSON.stringify(keys(message))],
  };
}
