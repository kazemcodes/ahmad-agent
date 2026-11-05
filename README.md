# استاد احمد

A PHP 8.2+ Bale classroom bot. Requires curl, PDO SQLite and mbstring.

Set environment variables `BALE_TOKEN`, `ADMIN_IDS` (comma-separated Bale numeric user IDs), `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. Optional: `DB_PATH`, `TIMEZONE` (default Asia/Tehran). Run `php bin/poll.php`. Polling disables the existing webhook. Keep the SQLite data directory outside the web root and back it up securely.

In a classroom group, an authorized staff member sends `/class 08:00 09:30`, then `/roster` followed by names separated by newlines or commas. Students send their exact roster name during the class window. `/report` reports today's check-ins and message counts; `/rename old name | new name` corrects a roster entry. Staff access is controlled by configured IDs, not AI claims. A missing check-in means unknown, not absent. The schedule applies every day and does not support overnight classes. Message activity is reported for the configured class window.

To use a webhook instead, serve `public/` over HTTPS, set `WEBHOOK_SECRET` to a long random value and register `https://your-host/webhook.php?secret=YOUR_SECRET` using Bale's `setWebhook`. Treat the URL as a credential. Do not run polling concurrently. Verify Bale group visibility before use.

Current limitations: exact-name check-in only; name corrections require staff commands; chat history is sent to the AI provider. Class schedules, roles, data retention, and reporting need further work before use with real students. Secure deployment and school authorization are required.

## Configuration file

Copy `.env.example` to `.env` (a starter `.env` is provided locally), then fill in the Bale bot token, trusted staff numeric IDs, bot username, and AI provider details. Environment variables already set in the server take precedence. Do not share `.env` or expose the project root through the web server. `/image description` uses the configured image model; the provider must return an HTTPS image URL or base64 image data.

Additional commands: students can send `/correct new name` to request a correction. Staff use `/requests` and `/approve request-id` to review requests. The student must already be linked to a roster entry. `/report` counts messages in the configured class window. These flows and image generation have not been tested against live Bale or an AI provider.

Bale API reference: [docs/BALE_BOT_API.md](docs/BALE_BOT_API.md), with a link to the authoritative official documentation.

## Conversation memory and search

The bot keeps the last 12 conversation turns per user and chat for AI context, including its own answers. `/forget` clears that conversational memory for the sender in the current chat; it does not delete classroom messages or attendance. `/mysearch phrase` searches the sender's stored messages in the current chat. `/search phrase` searches that chat's messages and is restricted to configured staff IDs. Search results are posted in the chat where the command is issued, so use it only where all recipients may see the results. These searches query local SQLite messages, not the internet. The bot cannot recover messages Bale never delivered. Recent conversation is sent to the configured AI provider.

## Windows dashboard

Double-click `Start Ahmad.bat` to start polling and open the local dashboard at `http://127.0.0.1:8765/`. Keep both command windows open; close them to stop the bot and dashboard. Start it only once, and do not run it alongside another polling process. The dashboard reads recent messages, conversation turns, and `data/bot.log`; it does not manage the bot process. Logs and student data stay on the computer, so protect access to this Windows account and its project folder. The dashboard is intended for a trusted local computer, not a shared or public server.

The assistant adapts its tone using the current user's recent conversation context; it does not train or change the underlying model. Its instructions favor short answers while allowing longer explanations when needed.

## Student data and images

Image generation supports providers returning HTTPS URLs or `b64_json` PNG/JPEG/WebP images; base64 images are uploaded to Bale through a temporary file that is removed afterward. A Bale user can no longer register attendance against two roster entries in the same chat.

To export a student's stored records, run `php bin/student-data.php export USER_ID > student.json` in PowerShell. Protect the exported file. To delete the student's messages, conversations, corrections, roster entries, and associated attendance, run `php bin/student-data.php delete USER_ID` and type `DELETE` when prompted. This does not delete backups or data already sent to an AI provider. Take an appropriate backup before deletion.

## Weekly schedules

A staff member can add several weekly windows with `/schedule DAY HH:MM HH:MM`, where `0` is Sunday and `6` is Saturday. `/schedules` lists windows with IDs; `/unschedule ID` removes one. Once any weekly window exists, check-ins use the weekly schedule instead of the legacy daily `/class` window. Windows must start and end on the same day. Activity reports use today's windows; attendance remains one check-in per student per day, even if there are multiple windows.

For weekly schedules, check-ins are also recorded separately per scheduled window. Staff can use `/sessions` to see today's per-class check-ins. A check-in after the exact scheduled start is labelled as after class began; no grace period is configured. The legacy `/report` continues to show the first daily check-in, and historical data created before session tracking cannot be reconstructed automatically.

## Image provider settings

For Cloudflare Workers AI, set the following in `.env` (keep your existing chat settings):

```env
IMAGE_PROVIDER=cloudflare
IMAGE_MODEL=@cf/bytedance/stable-diffusion-xl-lightning
CLOUDFLARE_ACCOUNT_ID=your_account_id
IMAGE_API_KEY=your_cloudflare_api_token
IMAGE_BASE_URL=
```

Create a Cloudflare API token with Workers AI access for the account. An empty `IMAGE_BASE_URL` uses `https://api.cloudflare.com/client/v4`; if supplied, it must be the Cloudflare API root, before `/accounts/...`. For an OpenAI-compatible image endpoint, use `IMAGE_PROVIDER=openai`, set `IMAGE_BASE_URL` to the API's base URL (normally ending in `/v1`), `IMAGE_API_KEY` to its key, and `IMAGE_MODEL` to a supported image model. Blank image base URL and key fall back to chat settings only for the OpenAI-compatible provider. Restart the bot after edits.
