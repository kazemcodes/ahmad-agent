<?php
declare(strict_types=1);

/**
 * Botkeep entry point.
 *
 * Botkeep's fixed startup command is `php /home/container/{{MAIN_FILE}}`
 * and the field is not editable, so this root-level launcher includes
 * the real poller. It runs bin/poll.php once (which blocks forever
 * polling Bale), which is the correct long-running mode for this bot.
 *
 * Required env vars (set in Botkeep Environment, not in a public file):
 *   BALE_TOKEN, ADMIN_IDS, BOT_USERNAME, AI_BASE_URL, AI_API_KEY, AI_MODEL
 * Plus, for image generation in a single-process container:
 *   POLL_INLINE_IMAGES=1
 */
fwrite(STDOUT, "Botkeep PHP worker is running.\n");
require __DIR__ . '/bin/poll.php';
