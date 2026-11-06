<?php
declare(strict_types=1);
final class GeminiImageProvider
{
    public function __construct(private string $key, private string $model) {}
    public function generate(string $prompt): array
    {
        if (!preg_match('/^[A-Za-z0-9._-]+$/',$this->model)) throw new RuntimeException('Invalid Gemini image model');
        $url='https://generativelanguage.googleapis.com/v1beta/models/'.$this->model.':generateContent';
        $body=['contents'=>[['parts'=>[['text'=>$prompt]]]],'generationConfig'=>['responseModalities'=>['TEXT','IMAGE']]];
        $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_UNESCAPED_UNICODE),CURLOPT_HTTPHEADER=>['Content-Type: application/json','x-goog-api-key: '.$this->key],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>120]);
        $raw=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); $error=curl_error($ch); curl_close($ch);
        if ($raw===false || $status>=400) {
            $failure=is_string($raw)?json_decode($raw,true):null;
            $apiStatus=is_array($failure) && is_string($failure['error']['status']??null) ? preg_replace('/[^A-Z_]/','',$failure['error']['status']) : '';
            $reasons=[]; foreach (($failure['error']['details']??[]) as $detail) if (is_array($detail) && isset($detail['reason']) && is_string($detail['reason'])) $reasons[]=preg_replace('/[^A-Z_]/','',$detail['reason']);
            throw new RuntimeException('Gemini image request failed: HTTP '.$status.($apiStatus?' status='.$apiStatus:'').($reasons?' reason='.implode(',',$reasons):'').($error?' '.$error:''));
        }
        $data=json_decode($raw,true); foreach(($data['candidates'][0]['content']['parts']??[]) as $part) { $inline=$part['inlineData']??$part['inline_data']??null; if (is_array($inline) && !empty($inline['data'])) return ['b64_json'=>$inline['data']]; }
        throw new RuntimeException('Gemini did not return an image');
    }
}
