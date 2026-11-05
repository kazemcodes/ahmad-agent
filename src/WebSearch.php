<?php
declare(strict_types=1);
final class WebSearch
{
    public function __construct(private string $key) {}
    public function search(string $query): array
    {
        $url='https://api.search.brave.com/res/v1/web/search?'.http_build_query(['q'=>mb_substr($query,0,400),'count'=>5]);
        $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_HTTPHEADER=>['Accept: application/json','X-Subscription-Token: '.$this->key],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>30]);
        $raw=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
        if ($raw===false || $status!==200) throw new RuntimeException('Web search failed: HTTP '.$status);
        $data=json_decode($raw,true); if (!is_array($data)) throw new RuntimeException('Invalid search response');
        $out=[]; foreach(($data['web']['results']??[]) as $row) { $url=$row['url']??''; if (!is_string($url) || !filter_var($url,FILTER_VALIDATE_URL) || !in_array(parse_url($url,PHP_URL_SCHEME),['http','https'],true)) continue; $out[]=['title'=>mb_substr(strip_tags((string)($row['title']??'')),0,120),'url'=>$url,'description'=>mb_substr(strip_tags((string)($row['description']??'')),0,200)]; } return array_slice($out,0,5);
    }
}
