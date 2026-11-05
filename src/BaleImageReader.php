<?php
declare(strict_types=1);
final class BaleImageReader
{
    public function __construct(private string $token) {}
    public function dataUri(string $path): string
    {
        if ($path==='' || str_contains($path,'..') || str_starts_with($path,'/') || !preg_match('~^[A-Za-z0-9_./-]+$~',$path)) throw new RuntimeException('Invalid Bale file path');
        $url='https://tapi.bale.ai/file/bot'.$this->token.'/'.$path;
        $buffer=''; $ch=curl_init($url);
        curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>60,CURLOPT_WRITEFUNCTION=>static function($ch,string $chunk) use (&$buffer): int { if (strlen($buffer)+strlen($chunk)>5*1024*1024) return 0; $buffer.=$chunk; return strlen($chunk); }]);
        $ok=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
        if (!$ok || $status!==200) throw new RuntimeException('Could not download image or image exceeds 5 MB');
        $info=@getimagesizefromstring($buffer); $mime=$info['mime']??'';
        if (!in_array($mime,['image/jpeg','image/png','image/webp'],true)) throw new RuntimeException('Unsupported image type');
        return 'data:'.$mime.';base64,'.base64_encode($buffer);
    }
}
