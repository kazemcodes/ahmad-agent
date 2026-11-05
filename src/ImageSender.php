<?php
declare(strict_types=1);

/** Sends generated image data without writing it to a permanent file. */
final class ImageSender
{
    public function __construct(private string $token) {}

    public function send(int $chat, ?int $reply, array $image): void
    {
        if (!empty($image['url']) && filter_var($image['url'], FILTER_VALIDATE_URL) && parse_url($image['url'], PHP_URL_SCHEME) === 'https') {
            $payload = ['chat_id'=>$chat, 'photo'=>$image['url']];
            if ($reply) $payload['reply_to_message_id'] = $reply;
            $this->request($payload, true);
            return;
        }
        $bytes = isset($image['b64_json']) ? base64_decode($image['b64_json'], true) : false;
        if ($bytes === false || strlen($bytes) > 15 * 1024 * 1024 || strlen($bytes) === 0) throw new RuntimeException('Image response contains no usable image');
        $info = @getimagesizefromstring($bytes);
        $types = ['image/png'=>'png', 'image/jpeg'=>'jpg', 'image/webp'=>'webp'];
        $mime = $info['mime'] ?? '';
        if (!isset($types[$mime])) throw new RuntimeException('Unsupported image format');
        $temp = tempnam(sys_get_temp_dir(), 'ahmad_img_');
        if ($temp === false) throw new RuntimeException('Unable to create image temporary file');
        try {
            if (file_put_contents($temp, $bytes) !== strlen($bytes)) throw new RuntimeException('Unable to write image temporary file');
            $payload = ['chat_id'=>(string)$chat, 'photo'=>new CURLFile($temp, $mime, 'image.'.$types[$mime])];
            if ($reply) $payload['reply_to_message_id'] = (string)$reply;
            $this->request($payload, false);
        } finally { @unlink($temp); }
    }

    private function request(array $payload, bool $json): void
    {
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $ch = curl_init('https://tapi.bale.ai/bot'.$this->token.'/sendPhoto');
            curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_POSTFIELDS=>$json ? json_encode($payload) : $payload, CURLOPT_HTTPHEADER=>$json ? ['Content-Type: application/json'] : [], CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>15, CURLOPT_TIMEOUT=>60]);
            $result = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); $error = curl_error($ch); $errno = curl_errno($ch); curl_close($ch);
            if ($result === false && in_array($errno, [6,7,28,35,52,56], true) && $attempt < 3) {
                error_log('[ahmad] image.upload_retry '.json_encode(['attempt'=>$attempt,'curl_code'=>$errno]));
                sleep($attempt * 2);
                continue;
            }
            if ($result === false || $status >= 400) throw new RuntimeException('Bale image upload failed: HTTP '.$status.' '.$error);
            $decoded = json_decode($result, true);
            if (!is_array($decoded) || empty($decoded['ok'])) throw new RuntimeException('Bale image upload was rejected');
            return;
        }

    }
}
