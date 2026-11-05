<?php
declare(strict_types=1);
final class VoiceTranscriber
{
    public function __construct(private string $token,private string $baseUrl,private string $key,private string $model) {}
    public function transcribe(string $path): string
    {
        if ($path==='' || str_contains($path,'..') || str_starts_with($path,'/') || !preg_match('~^[A-Za-z0-9_./-]+$~',$path)) throw new RuntimeException('Invalid Bale file path');
        $bytes=''; $ch=curl_init('https://tapi.bale.ai/file/bot'.$this->token.'/'.$path);
        curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>60,CURLOPT_WRITEFUNCTION=>static function($ch,string $chunk) use (&$bytes): int { if(strlen($bytes)+strlen($chunk)>10*1024*1024)return 0; $bytes.=$chunk;return strlen($chunk); }]);
        $ok=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if(!$ok || $status!==200 || !str_starts_with($bytes,'OggS')) throw new RuntimeException('Voice download failed or is not Ogg');
        $temp=tempnam(sys_get_temp_dir(),'ahmad_audio_'); if($temp===false)throw new RuntimeException('Cannot create temporary file');
        try { if(file_put_contents($temp,$bytes)!==strlen($bytes))throw new RuntimeException('Cannot save voice'); $ch=curl_init(rtrim($this->baseUrl,'/').'/audio/transcriptions'); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>['model'=>$this->model,'file'=>new CURLFile($temp,'audio/ogg','voice.ogg')],CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$this->key],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>120]); $raw=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch); if($raw===false || $status>=400)throw new RuntimeException('Transcription failed: HTTP '.$status); $result=json_decode($raw,true); $text=$result['text']??''; if(!is_string($text) || trim($text)==='')throw new RuntimeException('Empty transcription'); return trim($text); } finally { @unlink($temp); }
    }
}
