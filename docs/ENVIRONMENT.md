# Environment variables

Reference for every variable the bot reads (`src/config.ts`), so `.env.example`
can be filled in. Copy `.env.example` to `.env`; `dotenv` never overrides
variables already set in the real environment. Restart after edits. Never commit
`.env`.

## Bale bot

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `BALE_TOKEN` | yes | — | Bot token from Bale. The process exits with `Set BALE_TOKEN first.` without it. |
| `ADMIN_IDS` | recommended | — | Comma-separated numeric Bale user IDs allowed to run staff commands. Trimmed; empty entries ignored. |
| `BOT_USERNAME` | recommended | — | Bot username, with or without a leading `@` (the `@` is stripped). Needed to recognise replies addressed to the bot in groups. |
| `WEBHOOK_SECRET` | webhook mode | — | Long random value; the webhook URL is a credential. Not used in polling mode. |

## Chat model (OpenAI-compatible)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AI_BASE_URL` | yes | — | API base, normally ending in `/v1` (e.g. `https://api.openai.com/v1`). Trailing slashes are stripped. The bot calls `${AI_BASE_URL}/chat/completions`. |
| `AI_API_KEY` | yes | — | Key for the chat provider. |
| `AI_MODEL` | yes | — | Chat model name. |
| `AI_TIMEOUT_MS` | no | `120000` | Request timeout, clamped to 10000–300000. |
| `AI_FALLBACK_BASE_URL` | no | — | Base URL for a fallback chat provider, tried when the primary fails (chat only). |
| `AI_FALLBACK_API_KEY` | no | — | Key for the fallback provider. |
| `AI_FALLBACK_MODEL` | no | — | Model for the fallback provider. All three fallback vars must be set for it to be used. |

Using OpenRouter for chat or vision: set `AI_BASE_URL=https://openrouter.ai/api/v1`
and `AI_MODEL` to a model available there. It is OpenAI-shaped for
`/chat/completions`.

## Image generation

The primary provider is selected by `IMAGE_PROVIDER` (`openai` default,
`cloudflare`, `gemini`, or `openrouter`).

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `IMAGE_PROVIDER` | no | `openai` | `openai`, `cloudflare`, `gemini`, or `openrouter` (case-insensitive). Any other value fails with `Unknown image provider`. |
| `IMAGE_MODEL` | yes (not gemini) | — | For `openai`, a model accepted by that endpoint. For `cloudflare`, a Workers AI model ID beginning with `@` (e.g. `@cf/bytedance/stable-diffusion-xl-lightning`). For `openrouter`, an image-output model from `GET https://openrouter.ai/api/v1/images/models` (e.g. `bytedance-seed/seedream-4.5`). Ignored when `IMAGE_PROVIDER=gemini`. |
| `IMAGE_BASE_URL` | no | `AI_BASE_URL` (`openai`), empty/Cloudflare root (`cloudflare`), `https://openrouter.ai/api/v1` (`openrouter`) | For `openai`: API base normally ending in `/v1`; the bot posts to `${IMAGE_BASE_URL}/images/generations`. For `cloudflare`: the Cloudflare API root before `/accounts/...`; blank uses `https://api.cloudflare.com/client/v4`. For `openrouter`: the API base; the bot posts to `${IMAGE_BASE_URL}/images`. |
| `IMAGE_API_KEY` | no | `AI_API_KEY` (non-cloudflare) | Key for the image endpoint. A blank value falls back to the chat key for the `openai` provider; Cloudflare and Gemini do not. |
| `CLOUDFLARE_ACCOUNT_ID` | cloudflare | — | Must be 32 hexadecimal characters. |
| `GEMINI_IMAGE_API_KEY` | gemini/fallback | — | Google AI Studio API key. Billing must be enabled on the Google account; a Gemini app subscription is not API credit. |
| `GEMINI_IMAGE_MODEL` | gemini/fallback | — | e.g. `gemini-3.1-flash-lite-image`. Set both Gemini vars to enable fallback when the primary provider fails, or to use Gemini as the only provider. |

The provider must return an HTTPS image URL or base64 image data. For the
`openai` provider the response must have `data[0]` with `url` or `b64_json`;
Cloudflare responses are read from `result.image`.

### Using OpenRouter for image generation

Set `IMAGE_PROVIDER=openrouter`, `IMAGE_API_KEY` to an OpenRouter key, and
`IMAGE_MODEL` to a model listed by `GET https://openrouter.ai/api/v1/images/models`.
The bot posts `{ model, prompt }` to `POST https://openrouter.ai/api/v1/images`
and reads the base64 image from `data[0].b64_json` (a `url` is also accepted).
`IMAGE_BASE_URL` is optional and defaults to `https://openrouter.ai/api/v1`.

```env
IMAGE_PROVIDER=openrouter
IMAGE_MODEL=bytedance-seed/seedream-4.5
IMAGE_API_KEY=sk-or-...
```

OpenRouter's chat models (for `AI_MODEL`) are text/vision only; image output
comes from the image models above. The OpenRouter chat endpoint can still serve
`/chat/completions`, so the same key/base can be used for `AI_BASE_URL`.

## Vision (image questions)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VISION_MODEL` | to enable | — | An image-input model supported at `AI_BASE_URL`. Images are sent as `image_url` content on `/chat/completions`. Files over 5 MB and unsupported formats are rejected. |

## Voice transcription

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VOICE_MODEL` | to enable | — | Model for an OpenAI-compatible `/audio/transcriptions` endpoint. |
| `VOICE_BASE_URL` | no | `AI_BASE_URL` | Separate transcription base URL. |
| `VOICE_API_KEY` | no | `AI_API_KEY` | Separate transcription key. |

## Web search

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `BRAVE_SEARCH_API_KEY` | to enable | — | Enables `/web`. Search terms are sent to Brave. |

## Usage limits and behaviour

| Variable | Default | Clamp | Notes |
| --- | --- | --- | --- |
| `AI_HISTORY_TURNS` | `12` | 0–30 | Conversation turns sent as context. |
| `AI_HISTORY_CHARS` | `8000` | 0–30000 | Character budget for history. |
| `AI_MESSAGE_CHARS` | `4000` | 100–30000 | Longer messages are rejected with a request to shorten them. |
| `AI_MAX_OUTPUT_TOKENS` | `300` | 0+ | Set to `0` if the provider rejects `max_tokens`. |
| `CHAT_RATE_LIMIT` | `10` | 0+ | Chat requests per user per minute; `0` disables the limit. |
| `IMAGE_RATE_LIMIT` | `5` | 0+ | Image requests per user per hour; `0` disables the limit. |
| `GRACE_MINUTES` | `7` | 0–30 | Grace period after a class window for check-ins. |
| `FUZZY_MATCH` | on | — | Set to `0` to disable fuzzy roster-name matching. |

## Runtime and dashboard

| Variable | Default | Notes |
| --- | --- | --- |
| `DB_PATH` | `./data/ahmad.sqlite` | SQLite database path. Keep it outside the web root and back it up. |
| `TIMEZONE` | `Asia/Tehran` | Bot timezone. |
| `TZ` | — | Process timezone; set to the same value as `TIMEZONE` in deployment. |
| `PORT` | `3000` | Dashboard port (`SERVER_PORT` is an alias with lower precedence). |
| `DASHBOARD_TOKEN` | — | When set, dashboard actions require it and the server binds `0.0.0.0`; otherwise localhost-only. |
| `IMAGE_WORKERS` | `2` | In-process image concurrency, clamped 1–16. |
| `POLL_INLINE_IMAGES` | off | Legacy PHP flag; `1` makes the poller drain images itself. Kept for compatibility. |

## Minimum `.env` to start

```env
BALE_TOKEN=...
ADMIN_IDS=123456789
BOT_USERNAME=@your_bot
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=...
AI_MODEL=...
IMAGE_PROVIDER=openai
IMAGE_MODEL=...
TIMEZONE=Asia/Tehran
```

Then choose an image provider from the section above and set the matching key,
model, and (for Cloudflare) account ID.
