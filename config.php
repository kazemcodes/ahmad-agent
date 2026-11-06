<?php
$envFile=__DIR__.'/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line=trim($line);
        if ($line==='' || str_starts_with($line,'#') || !str_contains($line,'=')) continue;
        [$key,$value]=explode('=',$line,2); $key=trim($key); $value=trim($value);
        if (!preg_match('/^[A-Z_][A-Z0-9_]*$/',$key) || getenv($key)!==false) continue;
        if (strlen($value)>=2 && (($value[0]==='"' && str_ends_with($value,'"')) || ($value[0]==="'" && str_ends_with($value,"'")))) $value=substr($value,1,-1);
        putenv($key.'='.$value);
    }
}
return [
    'bale_token' => getenv('BALE_TOKEN') ?: '',
    'admin_ids' => array_filter(array_map('trim', explode(',', getenv('ADMIN_IDS') ?: ''))),
    'bot_username' => ltrim(getenv('BOT_USERNAME') ?: '', '@'),
    'db' => getenv('DB_PATH') ?: __DIR__ . '/data/ahmad.sqlite',
    'timezone' => getenv('TIMEZONE') ?: 'Asia/Tehran',
    'ai_url' => rtrim(getenv('AI_BASE_URL') ?: '', '/'),
    'ai_key' => getenv('AI_API_KEY') ?: '',
    'ai_model' => getenv('AI_MODEL') ?: '',
    'vision_model' => getenv('VISION_MODEL') ?: '',
    'voice_model' => getenv('VOICE_MODEL') ?: '',
    'voice_url' => rtrim(getenv('VOICE_BASE_URL') ?: (getenv('AI_BASE_URL') ?: ''), '/'),
    'voice_key' => getenv('VOICE_API_KEY') ?: (getenv('AI_API_KEY') ?: ''),
    'search_key' => getenv('BRAVE_SEARCH_API_KEY') ?: '',
    'gemini_image_key' => getenv('GEMINI_IMAGE_API_KEY') ?: '',
    'gemini_image_model' => getenv('GEMINI_IMAGE_MODEL') ?: '',
    'image_model' => getenv('IMAGE_MODEL') ?: '',
    'image_provider' => strtolower(getenv('IMAGE_PROVIDER') ?: 'openai'),
    'image_url' => rtrim(getenv('IMAGE_BASE_URL') ?: (getenv('IMAGE_PROVIDER') === 'cloudflare' ? '' : (getenv('AI_BASE_URL') ?: '')), '/'),
    'image_key' => getenv('IMAGE_API_KEY') ?: (getenv('IMAGE_PROVIDER') === 'cloudflare' ? '' : (getenv('AI_API_KEY') ?: '')),
    'cloudflare_account' => getenv('CLOUDFLARE_ACCOUNT_ID') ?: '',
    'history_turns' => max(0, min(30, (int)(getenv('AI_HISTORY_TURNS') !== false ? getenv('AI_HISTORY_TURNS') : 6))),
    'history_chars' => max(0, min(30000, (int)(getenv('AI_HISTORY_CHARS') !== false ? getenv('AI_HISTORY_CHARS') : 3000))),
    'message_chars' => max(100, min(30000, (int)(getenv('AI_MESSAGE_CHARS') ?: 4000))),
    'max_output_tokens' => max(0, (int)(getenv('AI_MAX_OUTPUT_TOKENS') !== false ? getenv('AI_MAX_OUTPUT_TOKENS') : 300)),
    'chat_limit' => max(0, (int)(getenv('CHAT_RATE_LIMIT') !== false ? getenv('CHAT_RATE_LIMIT') : 10)),
    'image_limit' => max(0, (int)(getenv('IMAGE_RATE_LIMIT') !== false ? getenv('IMAGE_RATE_LIMIT') : 5)),
    'webhook_secret' => getenv('WEBHOOK_SECRET') ?: '',
    'grace_minutes' => max(0, min(30, (int)(getenv('GRACE_MINUTES') !== false ? getenv('GRACE_MINUTES') : 7))),
    'fuzzy_match' => getenv('FUZZY_MATCH') !== '0',
    'dashboard_token' => getenv('DASHBOARD_TOKEN') ?: '',
    // '1' = legacy all-in-one poll.php also drains image jobs inline.
    // In the multi-process setup, bin/image-worker.php drains them instead.
    'poll_inline_images' => getenv('POLL_INLINE_IMAGES') === '1',
    'image_workers' => max(1, min(16, (int)(getenv('IMAGE_WORKERS') !== false ? getenv('IMAGE_WORKERS') : 2))),
];
