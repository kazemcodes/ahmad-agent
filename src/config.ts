// Port of config.php — same env keys, defaults, and clamps.
// dotenv never overrides real environment variables (matches PHP getenv guard).
import 'dotenv/config';

function env(key: string): string {
  return process.env[key] ?? '';
}

function trimSlash(v: string): string {
  return v.replace(/\/+$/, '');
}

function num(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw !== undefined && raw !== '' ? Number(raw) : fallback;
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export interface Config {
  bale_token: string;
  admin_ids: Set<string>;
  bot_username: string;
  db: string;
  timezone: string;
  ai_url: string;
  ai_key: string;
  ai_model: string;
  ai_fallback_url: string;
  ai_fallback_key: string;
  ai_fallback_model: string;
  ai_timeout_ms: number;
  vision_model: string;
  voice_model: string;
  voice_url: string;
  voice_key: string;
  search_key: string;
  gemini_image_key: string;
  gemini_image_model: string;
  image_model: string;
  image_provider: string;
  image_url: string;
  image_key: string;
  cloudflare_account: string;
  history_turns: number;
  history_chars: number;
  message_chars: number;
  max_output_tokens: number;
  chat_limit: number;
  image_limit: number;
  webhook_secret: string;
  grace_minutes: number;
  fuzzy_match: boolean;
  dashboard_token: string;
  poll_inline_images: boolean;
  image_workers: number;
  port: number;
  myclass_api_url: string;
  myclass_bot_token: string;
  myclass_timeout_ms: number;
}

export const config: Config = (() => {
  const aiBase = trimSlash(env('AI_BASE_URL'));
  const providerRaw = env('IMAGE_PROVIDER') || 'openai';
  const imageUrl = trimSlash(
    env('IMAGE_BASE_URL') ||
      (providerRaw === 'cloudflare' ? '' : aiBase || ''),
  );
  const imageKey =
    env('IMAGE_API_KEY') ||
    (providerRaw === 'cloudflare' ? '' : env('AI_API_KEY'));
  const c: Config = {
    bale_token: env('BALE_TOKEN'),
    admin_ids: new Set(
      env('ADMIN_IDS')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    bot_username: env('BOT_USERNAME').replace(/^@/, ''),
    db: env('DB_PATH') || './data/ahmad.sqlite',
    timezone: env('TIMEZONE') || 'Asia/Tehran',
    ai_url: aiBase,
    ai_key: env('AI_API_KEY'),
    ai_model: env('AI_MODEL'),
    ai_fallback_url: trimSlash(env('AI_FALLBACK_BASE_URL')),
    ai_fallback_key: env('AI_FALLBACK_API_KEY'),
    ai_fallback_model: env('AI_FALLBACK_MODEL'),
    ai_timeout_ms: num('AI_TIMEOUT_MS', 120000, 10000, 300000),
    vision_model: env('VISION_MODEL'),
    voice_model: env('VOICE_MODEL'),
    voice_url: trimSlash(env('VOICE_BASE_URL') || aiBase),
    voice_key: env('VOICE_API_KEY') || env('AI_API_KEY'),
    search_key: env('BRAVE_SEARCH_API_KEY'),
    gemini_image_key: env('GEMINI_IMAGE_API_KEY'),
    gemini_image_model: env('GEMINI_IMAGE_MODEL'),
    image_model: env('IMAGE_MODEL'),
    image_provider: providerRaw.toLowerCase(),
    image_url: imageUrl,
    image_key: imageKey,
    cloudflare_account: env('CLOUDFLARE_ACCOUNT_ID'),
    history_turns: num('AI_HISTORY_TURNS', 12, 0, 30),
    history_chars: num('AI_HISTORY_CHARS', 8000, 0, 30000),
    message_chars: num('AI_MESSAGE_CHARS', 4000, 100, 30000),
    max_output_tokens: num('AI_MAX_OUTPUT_TOKENS', 300, 0, Number.MAX_SAFE_INTEGER),
    chat_limit: num('CHAT_RATE_LIMIT', 10, 0, Number.MAX_SAFE_INTEGER),
    image_limit: num('IMAGE_RATE_LIMIT', 5, 0, Number.MAX_SAFE_INTEGER),
    webhook_secret: env('WEBHOOK_SECRET'),
    grace_minutes: num('GRACE_MINUTES', 7, 0, 30),
    fuzzy_match: env('FUZZY_MATCH') !== '0',
    dashboard_token: env('DASHBOARD_TOKEN'),
    poll_inline_images: env('POLL_INLINE_IMAGES') === '1',
    image_workers: num('IMAGE_WORKERS', 2, 1, 16),
    port: num('PORT', num('SERVER_PORT', 3000, 1, 65535), 1, 65535),
    myclass_api_url: trimSlash(env('MYCLASS_API_URL')),
    myclass_bot_token: env('MYCLASS_BOT_TOKEN'),
    myclass_timeout_ms: num('MYCLASS_TIMEOUT_MS', 90000, 5000, 180000),
  };
  return Object.freeze(c);
})();
