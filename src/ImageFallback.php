<?php
declare(strict_types=1);
final class CloudflareQuotaExceeded extends RuntimeException {}
final class ImageFallback
{
    private PDO $db;
    public function __construct(private array $config)
    {
        $this->db=new PDO('sqlite:'.$config['db'],null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $this->db->exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS image_provider_state (provider TEXT PRIMARY KEY, blocked_until INTEGER NOT NULL)');
    }
    public static function nextUtcDay(int $now): int { return (intdiv($now,86400)+1)*86400; }
    public function generate(string $prompt): array
    {
        $provider=$this->config['image_provider'];
        if ($provider==='gemini') {
            if (!$this->config['gemini_image_key'] || !$this->config['gemini_image_model']) throw new RuntimeException('Gemini image key or model is missing');
            return (new GeminiImageProvider($this->config['gemini_image_key'],$this->config['gemini_image_model']))->generate($prompt);
        }
        $scope='cloudflare:'.hash('sha256',$this->config['cloudflare_account']);
        $q=$this->db->prepare('SELECT blocked_until FROM image_provider_state WHERE provider=?'); $q->execute([$scope]); $locked=$provider==='cloudflare' && (int)$q->fetchColumn()>time();
        if (!$locked) {
            try { return (new ImageProvider($this->config))->generate($prompt); }
            catch (CloudflareQuotaExceeded $e) { $this->db->prepare('INSERT INTO image_provider_state(provider,blocked_until) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET blocked_until=excluded.blocked_until')->execute([$scope,self::nextUtcDay(time())]); error_log('[ahmad] image.cloudflare_quota_locked'); }
            catch (Throwable $e) { error_log('[ahmad] image.primary_failed '.json_encode(['provider'=>$provider,'error'=>$e->getMessage()])); }
        } else error_log('[ahmad] image.cloudflare_quota_lock_active');
        if (!$this->config['gemini_image_key'] || !$this->config['gemini_image_model']) throw new RuntimeException('Image provider failed and Gemini fallback is not configured');
        return (new GeminiImageProvider($this->config['gemini_image_key'],$this->config['gemini_image_model']))->generate($prompt);
    }
}
