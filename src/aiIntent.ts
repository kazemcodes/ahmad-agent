// AI intent classifier — used as a fallback when regex patterns fail.
// Sends a minimal classification request; returns the intent or null.
// If AI is unavailable, timeouts, or the response is unclear → null (bash fallback).
import { extractCompletion } from './aiCompletion.js';
import type { HttpClient } from './http.js';
import type { Config } from './config.js';

const INTENTS = ['report', 'today', 'schedules', 'web', 'image', 'help', 'chat'] as const;
type Intent = (typeof INTENTS)[number];

const SYSTEM =
  'You classify a Persian classroom bot message into exactly one intent. ' +
  'Reply with ONLY the intent word, nothing else. ' +
  'Intents: report (attendance list), today (today schedule), schedules (weekly schedule), ' +
  'web (web search), image (generate image), help (how to use bot), chat (anything else). ' +
  'If the message is a question about the bot, reply help.';

export async function classifyIntent(
  message: string,
  http: HttpClient,
  config: Config,
): Promise<Intent | null> {
  const url = config.ai_url;
  const key = config.ai_key;
  const model = config.ai_model;
  if (!url || !key || !model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await http.http(
      `${url}/chat/completions`,
      {
        model,
        stream: false,
        max_tokens: 10,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: message.slice(0, 300) },
        ],
      },
      { Authorization: `Bearer ${key}` },
    );
    const text = (extractCompletion(res).text ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if ((INTENTS as readonly string[]).includes(text)) return text as Intent;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Map an AI intent to an effective text that the dispatcher understands. */
export function intentToEffectiveText(intent: Intent, originalText: string): string | null {
  switch (intent) {
    case 'report':
      return '/report';
    case 'today':
      return '/today';
    case 'schedules':
      return '/schedules';
    case 'web':
      return '/web ' + originalText.replace(/^آقای ناظر\s*/u, '');
    case 'image':
      return '/image ' + originalText.replace(/^آقای ناظر\s*/u, '');
    case 'help':
      return '/help';
    case 'chat':
      return null;
  }
}
