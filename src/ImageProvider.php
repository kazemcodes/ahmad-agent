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
        $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_UNESCAPED_UNICODE),CURLOPT_HTTPHEADER=>['Content-Type: application/json','Authorization: Bearer '.$key],CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>120]);
        $result=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); $type=curl_getinfo($ch,CURLINFO_CONTENT_TYPE) ?: ''; $error=curl_error($ch); curl_close($ch);
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
