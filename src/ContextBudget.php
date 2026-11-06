<?php
declare(strict_types=1);
final class ContextBudget
{
    public static function history(array $turns, int $maxTurns, int $maxChars): array
    {
        if ($maxTurns<=0 || $maxChars<=0) return [];
        $result=[]; $remaining=$maxChars;
        foreach (array_reverse(array_slice($turns,-$maxTurns)) as $turn) {
            if (!is_string($turn['content']??null) || !in_array($turn['role']??'', ['user','assistant'],true)) continue;
            $content=$turn['content']; if (mb_strlen($content)>$remaining) { if ($remaining<100) break; $content=mb_substr($content,0,$remaining).'…'; }
            array_unshift($result,['role'=>$turn['role'],'content'=>$content]); $remaining-=mb_strlen($content);
            if ($remaining<=0) break;
        }
        return $result;
    }
}
