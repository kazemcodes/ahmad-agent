<?php
declare(strict_types=1);
final class ImageProvider
{
    public function __construct(private array $config) {}
    public function generate(string $prompt): array
    {
        $provider=$this->config['image_provider'];
        $model=$this->config['image_model'];
        $key=$this->config['image_key'];
        if (!$model || !$key) throw new RuntimeException('Image model or API key is missing');
        if ($provider==='cloudflare') {
            $account=$this->config['cloudflare_account'];
            if (!preg_match('/^[a-f0-9]{32}$/i',$account)) throw new RuntimeException('Cloudflare account ID must be 32 hexadecimal characters');
            if (!preg_match('~^@[a-z0-9_-]+/[a-z0-9._/-]+$~i',$model)) throw new RuntimeException('Invalid Cloudflare model ID');
            $base=$this->config['image_url'] ?: 'https://api.cloudflare.com/client/v4';
            $url=rtrim($base,'/').'/accounts/'.$account.'/ai/run/'.$model;
            $body=['prompt'=>$prompt];
        } elseif ($provider==='openai') {
            $url=rtrim($this->config['image_url'],'/').'/images/generations';
            $body=['model'=>$model,'prompt'=>$prompt];
        } else throw new RuntimeException('Unknown image provider');
        if (!filter_var($url,FILTER_VALIDATE_URL)) throw new RuntimeException('Invalid image endpoint');
        $multipart=$provider==='cloudflare' && (str_contains($model,'/flux-2-klein-4b') || str_contains($model,'/flux-2-dev'));
        $headers=['Authorization: Bearer '.$key];
        if (!$multipart) $headers[]='Content-Type: application/json';
        for ($attempt=1; $attempt<=3; $attempt++) {
            $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$multipart ? $body : json_encode($body,JSON_UNESCAPED_UNICODE),CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>120]);
            $result=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); $type=curl_getinfo($ch,CURLINFO_CONTENT_TYPE) ?: ''; $error=curl_error($ch); $errno=curl_errno($ch); curl_close($ch);
            if ($result===false && in_array($errno,[6,7,35],true) && $attempt<3) { error_log('[ahmad] image.provider_retry '.json_encode(['attempt'=>$attempt,'curl_code'=>$errno])); sleep($attempt*2); continue; }
            break;
        }
        if ($provider==='cloudflare' && $status===429 && is_string($result)) { $failure=json_decode($result,true); foreach(($failure['errors']??[]) as $item) if ((int)($item['code']??0)===3036) throw new CloudflareQuotaExceeded('Cloudflare daily quota exhausted'); }
        if ($result===false || $status>=400) throw new RuntimeException('Image provider HTTP '.$status.' '.$error);
        if (str_starts_with(strtolower($type),'image/')) return ['b64_json'=>base64_encode($result)];
        $json=json_decode($result,true);
        if (!is_array($json)) throw new RuntimeException('Image provider returned invalid data');
        if ($provider==='cloudflare') {
            $image=$json['result']['image']??null;
            if (is_string($image) && $image!=='') return filter_var($image,FILTER_VALIDATE_URL)?['url'=>$image]:['b64_json'=>$image];
            throw new RuntimeException('Cloudflare returned no image');
        }
        if (!isset($json['data'][0]) || !is_array($json['data'][0])) throw new RuntimeException('Image provider returned no image');
        return $json['data'][0];
    }
}
