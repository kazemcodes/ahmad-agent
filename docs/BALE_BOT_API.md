# Bale Bot API reference

This project reference describes the Bale Bot API and its use by استاد احمد. The authoritative, complete and current reference is [Bale's official bot documentation](https://docs.bale.ai/). This document is a guide and index, not a verbatim copy; consult the official documentation for every field, parameter, limit, and API change.

## Getting started

Create a bot through [@botfather](https://ble.ir/botfather) and keep its token private. The ordinary bot API endpoint is:

```text
https://tapi.bale.ai/bot<TOKEN>/<METHOD_NAME>
```

Requests use HTTPS. Both GET and POST are supported. Parameters can be sent as a query string, form data, or JSON; use multipart form data for file uploads. Responses are JSON: `ok` indicates success; successful results are in `result`, and failures can include `error_code` and `description`. Do not log the endpoint URL because it contains the bot token.

## Receiving updates

Choose one delivery method:

- `getUpdates`: long polling; use `offset` greater than the last processed `update_id`. Optional `limit` and `timeout` control batch size and waiting. The bot in this repository runs polling with `php bin/poll.php` and disables any existing webhook.
- `setWebhook`: register an HTTPS URL. Bale sends JSON updates via POST. Bale currently documents ports 443 and 88. `deleteWebhook` removes it; `getWebhookInfo` reports its status. Polling and webhooks are alternatives.

Bale documents a queue of the latest 2,000 updates for up to 24 hours. `update_id` helps detect duplicate and out-of-order deliveries. The update can contain a `message`, `edited_message`, `callback_query`, or other supported event; see the official Update section for the full list. Do not assume that a bot receives every group message: verify its actual group access and delivery behavior.

## Message and user data

A message can include `message_id`, `from`, `date`, `chat`, `text`, entities, media, and `reply_to_message`. User objects identify accounts by `id` and may include `first_name`, `last_name`, `username`, and `is_bot`. A chat has an `id` and `type`. Consult the official Message and MessageEntity sections for availability and types before relying on a field. User names are display data; use numeric IDs for permissions.

A mention, bot name in text, and a reply are separate triggers. The current application matches `استاد احمد`, the configured `BOT_USERNAME`, and replies whose sender username matches the configured bot. Messages are recorded only when Bale delivers them to this bot.

## Common methods

| Method | Purpose |
| --- | --- |
| `getMe` | Check the token and retrieve bot information. |
| `getUpdates`, `setWebhook`, `deleteWebhook`, `getWebhookInfo` | Manage update delivery. |
| `sendMessage` | Send text to `chat_id`; `reply_to_message_id` can reference a message. |
| `sendPhoto`, `sendAudio`, `sendDocument`, `sendVideo`, `sendAnimation`, `sendVoice`, `sendMediaGroup` | Send supported media. |
| `sendLocation`, `sendContact`, `sendChatAction` | Send location, contact, or an action indicator. |
| `getFile` | Obtain information needed to download a received file. |
| `answerCallbackQuery` | Respond to an inline button callback. |
| `getChat`, `getChatAdministrators`, `getChatMember`, `getChatMembersCount` | Read available chat and membership information. |
| `editMessageText`, `editMessageCaption`, `editMessageReplyMarkup`, `deleteMessage` | Edit or delete supported messages. |
| `pinChatMessage`, `unPinChatMessage`, `unpinAllChatMessages` | Manage pinned messages where permitted. |
| `banChatMember`, `unbanChatMember`, `promoteChatMember`, `leaveChat` | Manage membership where permitted. |
| `setChatTitle`, `setChatDescription`, `setChatPhoto`, `deleteChatPhoto` | Update chat details where permitted. |
| `createChatInviteLink`, `revokeChatInviteLink`, `exportChatInviteLink` | Manage supported invite links. |
| `forwardMessage`, `copyMessage` | Forward or copy an existing message. |
| `sendInvoice`, `createInvoiceLink`, `answerPreCheckoutQuery`, `inquireTransaction` | Payment-related operations; read official payment documentation before use. |
| `uploadStickerFile`, `createNewStickerSet`, `addStickerToSet` | Manage supported sticker sets. |

The official reference also documents buttons, callback queries, mini-app data, file types, payments, stickers, and additional object types and constraints. This application does not implement all these operations. API methods, limits, and privileges must be verified against the official reference.

## Sending media

Depending on the method, media can be provided as an existing `file_id`, an accessible URL, or a multipart upload. The official documentation describes method-specific restrictions, sizes, and MIME types. `getFile` returns a path used with Bale's file-download endpoint; this path and token should be treated as sensitive. The application's image command currently accepts only an HTTPS image URL returned by its configured image provider.

## Webhook configuration

Serve only the project's `public` directory through HTTPS. Set a long random `WEBHOOK_SECRET` in `.env` and register `https://your-host/webhook.php?secret=<secret>` with `setWebhook`. The secret in this project is an application-level URL secret, not a documented Bale signature. Treat the complete URL as a credential; protect web-server and proxy logs and rotate it if exposed. If registration fails, check HTTPS reachability and Bale's supported ports. The project also offers polling, which does not need a public webhook.

## Project configuration

Copy `.env.example` to `.env` and set `BALE_TOKEN`, `ADMIN_IDS` (comma-separated trusted numeric user IDs), `BOT_USERNAME`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and optionally `IMAGE_MODEL` and `WEBHOOK_SECRET`. `TIMEZONE` defaults to Asia/Tehran. Never publish `.env` or the SQLite database. Class and attendance commands are described in the project README.

## Important limitations

The documented bot API does not establish a reliable way to list everyone currently online. A message or check-in provides evidence of activity, not continuous presence. Teacher reports must describe unobserved attendance as unknown. The bot stores messages it receives, and configured AI requests can transmit recent chat content to the provider; deploy only with appropriate authorization and data controls.

## Official documentation index

The [official reference](https://docs.bale.ai/) contains sections for bot creation, HTTP requests, updates and webhooks, all supported objects, file uploads, methods, stickers, payments, and business messaging. The business endpoint uses `/business/bot<TOKEN>/...` and has different capabilities and restrictions; it is not a replacement for the ordinary group bot API. Use the official documentation as the source of truth for current coverage and exact schemas.
