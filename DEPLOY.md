# آقای ناظر — Deploy & Live Test

## Bale API (verified from docs.bale.ai)

- API is Telegram-compatible: `https://tapi.bale.ai/bot<TOKEN>/<method>`
- Get updates via `getUpdates` (long polling, `timeout` ≤ 30s) **or** `setWebhook` (ports 443/88)
- Update object: `update_id`, `message` / `edited_message` / `callback_query`
- Message: `message_id`, `from{id:64-bit,first_name,last_name,username}`, `chat{id,type:private|group|channel,title}`, `date`, `text`, `entities[{type:mention|bot_command,offset,length (UTF-16)}]`, `reply_to_message`
- Send: `sendMessage{chat_id,text,reply_to_message_id}`, `sendPhoto{chat_id,photo}`, `sendChatAction`, `answerCallbackQuery`
- Bot creation: chat **@botfather** in Bale → `/newbot` → token like `123456789:abc...`
- Group visibility: add bot to group; Bale delivers group messages only if bot is admin/visible — **test this first**

## Current code status (fixed)

- ✅ Fixed PHP parse error: `DEFAULT 'pending'` was unescaped inside single-quoted string (`DEFAULT \'pending\'`)
- ✅ Verified: `php -l` clean, SQLite schema creates 6 tables (`updates,classes,roster,messages,attendance,corrections`), norm/staff logic passes
- The project was already ~90% built — this fix is the only code change needed

## 1. Create the bot
1. In Bale, open **@botfather**, `/newbot`, name it **آقای ناظر**, pick a `@username` (e.g. `@OstadAhmadBot`)
2. Save the token

## 2. Configure `.env`
```bash
cp .env.example .env
# edit .env:
BALE_TOKEN=<from botfather>
ADMIN_IDS=<your numeric Bale user id>   # find via /start then check DB messages table
BOT_USERNAME=OstadAhmadBot
AI_BASE_URL=https://api.openai.com/v1   # or any OpenAI-compatible base
AI_API_KEY=<your key>
AI_MODEL=gpt-4o-mini                    # your chat model
IMAGE_MODEL=dall-e-3                    # or other image model
WEBHOOK_SECRET=<long random>            # only if using webhook
TIMEZONE=Asia/Tehran
```

## 3. Run (polling — easiest for local/VPS)
```bash
php bin/poll.php
```

## 4. Run (webhook — for production HTTPS)
1. Serve only `public/` from web root (never project root)
2. Register: `curl "https://tapi.bale.ai/bot<TOKEN>/setWebhook?url=https://your-host/webhook.php?secret=<WEBHOOK_SECRET>"`
3. **Never run both at once** — polling calls `deleteWebhook` on startup

## 5. Live test checklist (in order)

In a test group with the bot added:
- [ ] Send `/start` → expect greeting + command list
- [ ] As teacher: `/class 08:00 09:30` → "زمان کلاس ذخیره شد"
- [ ] `/roster` + paste names (one per line) → "نام‌ها دریافت شد: N"
- [ ] As student **inside class window**: send exact roster name → "حضورت ثبت شد"
- [ ] Same name from a second account → "قبلاً به حساب دیگری متصل شده"
- [ ] `/report` → attendance list + class-window message counts
- [ ] As student: `آقای ناظر سلام، این سوال را توضیح بده` → AI Persian answer
- [ ] Reply to the bot's message → bot answers
- [ ] `@OstadAhmadBot سلام` → bot answers
- [ ] `/image یک منظره کوهستانی زیبا` → bot sends a photo (needs IMAGE_MODEL + HTTPS image URL from provider)
- [ ] `/correct نام جدید` → `/requests` (teacher) → `/approve <id>`

## Known limitations (be honest with the school)
- Exact-name check-in only; `ی/ك` normalization helps but typos still fail
- No brain on identity — attendance is deterministic, AI never invents attendance
- Chat history (last 12 msgs) is sent to the AI provider — **get school consent**
- Group message visibility depends on Bale group permissions — verify before rollout
- Not a privacy-safe system for minors without school authorization + data retention policy
