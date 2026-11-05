<?php
declare(strict_types=1);
final class ClassroomIntent
{
    public static function command(string $text, bool $addressed): ?string
    {
        if (!$addressed || str_starts_with(trim($text), '/')) return null;
        $text=str_replace(['ي','ك','‌'],['ی','ک',' '],$text);
        if (preg_match('/(حاضر|حضور|غایب|غیبت|حضور و غیاب)/u',$text) && preg_match('/(کیا|کی |چه کسی|چه کسانی|چه افرادی|گزارش|لیست|فهرست|چند نفر|بگو|بده|بودن|بودند)/u',$text)) return '/report';
        if (preg_match('/(برنامه|ساعت|زمان)/u',$text) && preg_match('/(کلاس|هفتگی|امروز)/u',$text)) return str_contains($text,'امروز') ? '/today' : '/schedules';
        return null;
    }
}
